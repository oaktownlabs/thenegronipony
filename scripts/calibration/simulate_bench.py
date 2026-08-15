#!/usr/bin/env python3
"""Clearly-labelled UNO R3 calibration protocol simulator.

The simulator never emits calibrated mass and must never be used as trial
evidence. It exists only for serial parser, reconnect, and UI state work.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from typing import Any, Iterable


PROTOCOL_VERSION = 1
SERIAL_BAUD = 250_000
MAX_COMMAND_BYTES = 191
DEVICE_ID = "SIMULATOR-NOT-CALIBRATION"
BOOT_ID = "sim-0001"
STATES = {"idle", "tare", "armed", "running", "settling", "complete", "fault"}


def compact(value: dict[str, Any]) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=False)


@dataclass
class Simulator:
    now_ms: int = 0
    seq: int = 0
    last_n: int = 0
    state: str = "idle"
    trial: str | None = None
    last_command: dict[str, Any] | None = None
    last_ack: dict[str, Any] | None = None
    output: list[dict[str, Any]] = field(default_factory=list)

    def _base(self, frame_type: str) -> dict[str, Any]:
        self.seq += 1
        frame = {
            "v": PROTOCOL_VERSION,
            "t": frame_type,
            "dev": DEVICE_ID,
            "boot": BOOT_ID,
            "seq": self.seq,
            "ms": self.now_ms,
            "sim": True,
        }
        self.now_ms += 1
        return frame

    def emit(self, frame_type: str, **fields: Any) -> dict[str, Any]:
        frame = self._base(frame_type)
        frame.update(fields)
        self.output.append(frame)
        return frame

    def hello(self) -> None:
        self.emit(
            "hello",
            fw="simulator-only",
            baud=SERIAL_BAUD,
            hz=10,
            lastn=self.last_n,
            scale=0,
            cal=None,
            caln=None,
            cald=None,
            idok=0,
            limitmg=0,
        )

    def ack(self, command: dict[str, Any], ok: bool, code: str, *, dup: bool = False) -> None:
        frame = self.emit(
            "ack",
            id=command.get("id", ""),
            n=command.get("n"),
            ok=1 if ok else 0,
            dup=1 if dup else 0,
            lastn=self.last_n,
            state=self.state,
            code=code,
        )
        self.last_ack = frame

    def state_frame(self) -> None:
        self.emit(
            "state",
            state=self.state,
            trial=self.trial,
            step=None,
            pump="none",
            duty=0,
            zero=None,
        )

    def context_state_frame(
        self, *, trial: str, step: int | None, pump: str, duty: int
    ) -> None:
        self.emit(
            "state",
            state=self.state,
            trial=trial,
            step=step,
            pump=pump,
            duty=duty,
            zero=None,
        )

    def sample(self, raw: int) -> None:
        self.emit(
            "s",
            trial=self.trial,
            step=None,
            state=self.state,
            pump="none",
            raw=raw,
            mg=None,
            duty=0,
            tc=0,
            flags=0,
        )

    def fault_transition(self, code: str) -> None:
        # Real firmware emits a context-bearing state before the fault-code
        # frame, then releases the trial context for all later samples.
        self.state = "fault"
        self.state_frame()
        self.emit("fault", state="fault", code=code)
        self.trial = None

    def _sequence_status(self, command: dict[str, Any]) -> str:
        n = command.get("n")
        if not isinstance(n, int):
            return "missing_n"
        if n == self.last_n and self.last_command == command:
            return "duplicate"
        if n == self.last_n and self.last_command != command:
            return "conflict"
        if n != self.last_n + 1:
            return "sequence"
        return "next"

    def handle(self, command: dict[str, Any]) -> None:
        if command.get("v") != PROTOCOL_VERSION or not isinstance(command.get("t"), str):
            self.fault_transition("protocol")
            return

        command_type = command["t"]
        if command_type == "hello":
            self.hello()
            return

        sequence_status = self._sequence_status(command)
        if sequence_status == "duplicate":
            self.ack(
                command,
                bool(self.last_ack and self.last_ack["ok"]),
                str(self.last_ack["code"]) if self.last_ack else "ok",
                dup=True,
            )
            return
        if sequence_status != "next":
            self.state = "fault"
            self.ack(command, False, "command_sequence")
            self.fault_transition("protocol")
            return

        self.last_n = command["n"]
        self.last_command = command.copy()

        if command_type == "hb":
            self.ack(command, True, "ok")
        elif command_type == "tare":
            # The shipped firmware has no invented zero-noise threshold. It
            # therefore rejects tare and fails off until physical data has
            # been reviewed and provisioned.
            code = "tare_stability_unconfigured" if self.state == "idle" else "bad_state"
            self.state = "fault"
            self.ack(command, False, code)
            self.fault_transition("invalid_command")
        elif command_type == "run":
            # No successful tare can exist in the uncommissioned baseline, so
            # the firmware encounters the trial gate before the scale gate.
            code = "trial_mismatch" if self.trial != command.get("trial") else "scale_uncalibrated"
            self.state = "fault"
            self.ack(command, False, code)
            self.fault_transition("invalid_command")
        elif command_type == "stop":
            if self.state == "fault":
                self.ack(command, False, "bad_state")
            else:
                previous_state = self.state
                self.state = "idle"
                self.trial = None
                self.ack(command, True, "ok")
                if previous_state != self.state:
                    self.state_frame()
        elif command_type == "clear" and self.state == "fault":
            self.state = "idle"
            self.trial = None
            self.ack(command, True, "ok")
            self.state_frame()
        else:
            self.state = "fault"
            self.ack(command, False, "bad_state")
            self.fault_transition("invalid_command")

    def startup(self) -> None:
        self.hello()
        self.state_frame()
        # Synthetic raw zero exercises the signed ADC field only. `sim:true`,
        # the simulator device ID, and `mg:null` keep it out of calibration use.
        self.sample(0)

    def device_heartbeat(self) -> None:
        self.emit("hb", state=self.state, lastn=self.last_n)

    def terminal_context_fixture(self) -> None:
        """Exercise finite trial context without inventing calibration data."""
        self.state = "complete"
        self.trial = "fixture-complete"
        self.context_state_frame(
            trial=self.trial, step=7, pump="k", duty=5000
        )
        self.trial = None
        self.sample(1)

        self.state = "fault"
        self.trial = "fixture-fault"
        self.context_state_frame(
            trial=self.trial, step=8, pump="g", duty=2500
        )
        self.emit("fault", state="fault", code="hard_stop")
        self.trial = None
        self.sample(2)

        # An accepted stop returns the core to idle and clears its step before
        # the final context-bearing state; later samples are still anonymous.
        self.state = "idle"
        self.trial = "fixture-stop"
        self.context_state_frame(
            trial=self.trial, step=None, pump="none", duty=0
        )
        self.trial = None
        self.sample(3)


def parse_line(line: bytes) -> dict[str, Any]:
    stripped = line.rstrip(b"\r\n")
    if len(stripped) > MAX_COMMAND_BYTES:
        raise ValueError(f"command exceeds {MAX_COMMAND_BYTES} bytes")
    value = json.loads(stripped.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("command must be a JSON object")
    return value


def run(lines: Iterable[bytes]) -> Simulator:
    simulator = Simulator()
    simulator.startup()
    for line in lines:
        if not line.strip():
            continue
        try:
            simulator.handle(parse_line(line))
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            simulator.state = "fault"
            # The fixture validator intentionally accepts only the canonical
            # fault schema, so parser details stay on stderr/logs rather than
            # adding an AVR-incompatible wire field.
            print(f"simulator parse fault: {str(error)[:48]}", file=sys.stderr)
            simulator.fault_transition("protocol")
    return simulator


def fixture_commands() -> list[bytes]:
    commands = [
        {"v": 1, "t": "hello", "id": "h1"},
        {"v": 1, "t": "hb", "id": "h2", "n": 1},
        {
            "v": 1,
            "t": "run",
            "id": "r1",
            "n": 2,
            "trial": "fixture-trial",
            "step": 0,
            "pump": "k",
            "dir": "f",
            "duty": 0,
            "warm": 0,
            "collect": 0,
            "settle": 0,
            "hard": 0,
            "maxmg": 0,
        },
        {"v": 1, "t": "clear", "id": "c1", "n": 3},
        {
            "v": 1,
            "t": "tare",
            "id": "t1",
            "n": 4,
            "trial": "fixture-trial",
            "stable": 0,
            "wait": 0,
        },
        {"v": 1, "t": "clear", "id": "c2", "n": 5},
        {"v": 1, "t": "stop", "id": "s1", "n": 6},
    ]
    return [(compact(command) + "\n").encode("utf-8") for command in commands]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixture",
        action="store_true",
        help="emit the deterministic shipped protocol session",
    )
    args = parser.parse_args()
    print(
        "SIMULATED DATA ONLY - NOT A CALIBRATION; mass is deliberately null",
        file=sys.stderr,
    )
    simulator = run(fixture_commands() if args.fixture else sys.stdin.buffer)
    if args.fixture:
        # These protocol-only terminal frames are visibly simulated and keep
        # mass null; they test spool termination, not physical state behavior.
        simulator.terminal_context_fixture()
        # Exercise the autonomous device-heartbeat frame without pretending
        # that a host heartbeat command directly causes it.
        simulator.device_heartbeat()
    for frame in simulator.output:
        print(compact(frame))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
