CXX ?= c++
CXXFLAGS ?= -std=c++11 -Wall -Wextra -Werror -pedantic -O2
CPPFLAGS ?= -I../src

SOURCES = test_main.cpp ../src/core/BenchCore.cpp ../src/core/CommandParser.cpp
TARGET = calibration_bench_tests
ADAPTER_SOURCES = hardware_adapter_test.cpp ../src/Hx711.cpp \
	../src/MotorDriver.cpp ../src/WireProtocol.cpp ../src/core/BenchCore.cpp \
	../src/core/CommandParser.cpp
ADAPTER_TARGET = calibration_bench_adapter_tests

.PHONY: all test syntax clean

all: $(TARGET) $(ADAPTER_TARGET)

$(TARGET): $(SOURCES)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) $(SOURCES) -o $(TARGET)

$(ADAPTER_TARGET): $(ADAPTER_SOURCES)
	$(CXX) -Istubs $(CPPFLAGS) $(CXXFLAGS) -D__AVR_ATmega328P__ \
		$(ADAPTER_SOURCES) -o $(ADAPTER_TARGET)

syntax:
	$(CXX) -Istubs $(CPPFLAGS) $(CXXFLAGS) -D__AVR_ATmega328P__ \
		-x c++ -fsyntax-only ../CalibrationBench.ino

test: $(TARGET) $(ADAPTER_TARGET) syntax
	./$(TARGET)
	./$(ADAPTER_TARGET)

clean:
	rm -f $(TARGET) $(ADAPTER_TARGET)
