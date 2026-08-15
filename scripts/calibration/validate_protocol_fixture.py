#!/usr/bin/env python3
"""Validate the compact host/device NDJSON protocol fixtures."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


MAX_COMMAND_BYTES = 191
COMMAND_TYPES = {"hello", "hb", "tare", "run", "stop", "clear"}
DEVICE_TYPES = {"hello", "ack", "state", "s", "hb", "fault"}
IDENTIFIER = re.compile(r"^[A-Za-z0-9_.:-]+$")

COMMAND_FIELDS = {
    "hello": {"v", "t", "id"},
    "hb": {"v", "t", "id", "n"},
    "tare": {"v", "t", "id", "n", "trial", "stable", "wait"},
    "run": {
        "v",
        "t",
        "id",
        "n",
        "trial",
        "step",
        "pump",
        "dir",
        "duty",
        "warm",
        "collect",
        "settle",
        "hard",
        "maxmg",
    },
    "stop": {"v", "t", "id", "n"},
    "clear": {"v", "t", "id", "n"},
}

COMMON_DEVICE_FIELDS = {"v", "t", "dev", "boot", "seq", "ms", "sim"}
DEVICE_FIELDS = {
    "hello": COMMON_DEVICE_FIELDS
    | {"fw", "baud", "hz", "lastn", "scale", "cal", "caln", "cald", "idok", "limitmg"},
    "ack": COMMON_DEVICE_FIELDS
    | {"id", "n", "ok", "dup", "lastn", "state", "code"},
    "state": COMMON_DEVICE_FIELDS
    | {"state", "trial", "step", "pump", "duty", "zero"},
    "s": COMMON_DEVICE_FIELDS
    | {"trial", "step", "state", "pump", "raw", "mg", "duty", "tc", "flags"},
    "hb": COMMON_DEVICE_FIELDS | {"state", "lastn"},
    "fault": COMMON_DEVICE_FIELDS | {"state", "code"},
}


def is_uint(value: Any) -> bool:
    return type(value) is int and 0 <= value <= 0xFFFFFFFF


def validate_identifier(value: Any, maximum: int, label: str) -> None:
    assert isinstance(value, str) and 0 < len(value) <= maximum, f"bad {label} length"
    assert IDENTIFIER.fullmatch(value), f"bad {label} characters"


def read_objects(path: Path) -> list[tuple[int, bytes, dict[str, Any]]]:
    result = []
    for number, raw in enumerate(path.read_bytes().splitlines(), 1):
        if not raw.strip():
            continue
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict):
            raise AssertionError(f"{path}:{number}: expected JSON object")
        result.append((number, raw, value))
    return result


def validate_commands(path: Path) -> None:
    objects = read_objects(path)
    expected_n = 1
    for number, raw, value in objects:
        assert len(raw) <= MAX_COMMAND_BYTES, (
            f"{path}:{number}: {len(raw)} bytes exceeds {MAX_COMMAND_BYTES}"
        )
        assert value.get("v") == 1, f"{path}:{number}: unsupported version"
        assert value.get("t") in COMMAND_TYPES, f"{path}:{number}: bad command type"
        command_type = value["t"]
        assert set(value) == COMMAND_FIELDS[command_type], (
            f"{path}:{number}: fields do not match {command_type} schema"
        )
        validate_identifier(value.get("id"), 16, "command id")
        if value["t"] == "hello":
            assert "n" not in value, f"{path}:{number}: hello must not consume n"
        else:
            assert value.get("n") == expected_n, (
                f"{path}:{number}: expected n={expected_n}"
            )
            expected_n += 1
        if command_type in {"tare", "run"}:
            validate_identifier(value.get("trial"), 24, "trial id")
        if command_type == "tare":
            assert is_uint(value.get("stable")) and is_uint(value.get("wait")), (
                f"{path}:{number}: tare timings must be uint32"
            )
        if command_type == "run":
            assert value.get("pump") in {"k", "g"}, f"{path}:{number}: bad pump"
            assert value.get("dir") in {"f", "r"}, f"{path}:{number}: bad direction"
            for field in ("step", "duty", "warm", "collect", "settle", "hard", "maxmg"):
                assert is_uint(value.get(field)), f"{path}:{number}: {field} must be uint32"
            assert value["step"] <= 0xFFFF and value["duty"] <= 0xFFFF, (
                f"{path}:{number}: step/duty exceed AVR uint16"
            )


def validate_device(path: Path) -> None:
    objects = read_objects(path)
    expected_seq = 1
    previous_ms = -1
    device = None
    boot = None
    pending_terminal_release: set[str] = set()
    terminal_release_seen: set[str] = set()
    states = {"boot", "idle", "tare", "armed", "running", "settling", "complete", "fault"}
    for number, _raw, value in objects:
        assert value.get("v") == 1, f"{path}:{number}: unsupported version"
        assert value.get("t") in DEVICE_TYPES, f"{path}:{number}: bad frame type"
        frame_type = value["t"]
        assert set(value) == DEVICE_FIELDS[frame_type], (
            f"{path}:{number}: fields do not match {frame_type} schema"
        )
        assert value.get("sim") is True, f"{path}:{number}: missing sim:true"
        assert value.get("dev") == "SIMULATOR-NOT-CALIBRATION", (
            f"{path}:{number}: unsafe simulator device id"
        )
        assert value.get("seq") == expected_seq, (
            f"{path}:{number}: expected seq={expected_seq}"
        )
        expected_seq += 1
        assert is_uint(value.get("ms")) and value["ms"] >= previous_ms, (
            f"{path}:{number}: non-monotonic ms"
        )
        previous_ms = value["ms"]
        device = device or value["dev"]
        boot = boot or value.get("boot")
        assert value["dev"] == device and value.get("boot") == boot, (
            f"{path}:{number}: identity changed within fixture"
        )
        if "state" in value:
            assert value["state"] in states, f"{path}:{number}: invalid state"
        if frame_type == "hello":
            assert value["baud"] == 250000 and value["hz"] == 10, (
                f"{path}:{number}: simulator transport metadata drift"
            )
            assert value["scale"] == 0 and value["cal"] is None, (
                f"{path}:{number}: simulator must be uncalibrated"
            )
            assert value["caln"] is None and value["cald"] is None, (
                f"{path}:{number}: simulator must not carry calibration coefficients"
            )
            assert value["idok"] == 0 and value["limitmg"] == 0, (
                f"{path}:{number}: simulator commissioning gates must be closed"
            )
        elif frame_type == "ack":
            validate_identifier(value.get("id"), 16, "ack command id")
            assert is_uint(value.get("n")) and is_uint(value.get("lastn")), (
                f"{path}:{number}: bad acknowledgment sequence"
            )
            assert value["ok"] in {0, 1} and type(value["ok"]) is int, (
                f"{path}:{number}: ok must be integer 0|1"
            )
            assert value["dup"] in {0, 1} and type(value["dup"]) is int, (
                f"{path}:{number}: dup must be integer 0|1"
            )
        elif frame_type in {"state", "s"}:
            assert value["trial"] is None or (
                isinstance(value["trial"], str) and IDENTIFIER.fullmatch(value["trial"])
            ), f"{path}:{number}: bad trial"
            assert value["step"] is None or is_uint(value["step"]), (
                f"{path}:{number}: bad step"
            )
            assert value["pump"] in {"none", "k", "g"}, (
                f"{path}:{number}: bad pump"
            )
            assert is_uint(value["duty"]), f"{path}:{number}: bad duty"
            if frame_type == "state" and value["trial"] is not None and (
                value["state"] in {"complete", "fault"}
                or (value["state"] == "idle" and value["pump"] == "none")
            ):
                pending_terminal_release.add(value["state"])
        if frame_type == "state":
            assert value["zero"] is None or type(value["zero"]) is int, (
                f"{path}:{number}: bad tare zero"
            )
        elif frame_type == "s":
            assert value.get("mg") is None, (
                f"{path}:{number}: simulator must not emit calibrated mass"
            )
            assert type(value["raw"]) is int, f"{path}:{number}: raw must be signed integer"
            assert is_uint(value["tc"]) and is_uint(value["flags"]), (
                f"{path}:{number}: bad timer count or flags"
            )
            if value["state"] in pending_terminal_release:
                assert value["trial"] is None and value["step"] is None, (
                    f"{path}:{number}: post-terminal sample retained trial/step"
                )
                assert value["pump"] == "none" and value["duty"] == 0, (
                    f"{path}:{number}: post-terminal sample retained pump/duty"
                )
                assert value["tc"] == 0, (
                    f"{path}:{number}: post-terminal sample retained timer count"
                )
                terminal_release_seen.add(value["state"])
                pending_terminal_release.remove(value["state"])
        elif frame_type == "hb":
            assert is_uint(value["lastn"]), f"{path}:{number}: bad lastn"
        elif frame_type == "fault":
            assert value["state"] == "fault", f"{path}:{number}: fault state mismatch"
    assert not pending_terminal_release, (
        f"{path}: terminal context markers without a released sample: "
        f"{sorted(pending_terminal_release)}"
    )
    assert terminal_release_seen == {"complete", "fault", "idle"}, (
        f"{path}: fixture must cover complete/fault/stop context release"
    )


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {argv[0]} HOST_COMMANDS.ndjson DEVICE_FRAMES.ndjson", file=sys.stderr)
        return 2
    command_path = Path(argv[1])
    device_path = Path(argv[2])
    validate_commands(command_path)
    validate_device(device_path)
    print(
        f"ok: {command_path} and {device_path} satisfy the AVR protocol fixture gates"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
