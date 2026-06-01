# firmware

ESP32 펌웨어 관련 폴더입니다.  
센서 데이터 수집, 데이터 전처리, 로컬 진단, 상태 기반 전송, MQTT 발행 코드를 관리합니다.

## 폴더 구조

```text
firmware/
└── esp32_app/
    ├── components/
    │   ├── sensors/        # 센서 데이터 읽기
    │   ├── preprocess/     # 센서값 전처리
    │   ├── diagnosis/      # 로컬 진단 로직
    │   ├── state_logic/    # 상태 전이 및 모드 전환 로직
    │   └── comms/          # MQTT 통신
    │
    ├── main/               # 애플리케이션 진입점
    ├── CMakeLists.txt
    ├── dependencies.lock
    └── sdkconfig
