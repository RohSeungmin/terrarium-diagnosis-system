# MQTT Broker 실행 방법

본 문서는 Mosquitto MQTT 브로커 실행 및 테스트 방법을 정리한 문서이다.  
MQTT 브로커는 ESP32와 Node.js 서버 사이에서 메시지를 중계하는 역할을 한다.

```text
ESP32 → Mosquitto Broker → Node.js Server → DB / API / Dashboard
```

\---

## 1\. Mosquitto 설치

Windows용 Mosquitto를 설치한다.

설치 후 CMD에서 아래 명령어로 설치 여부를 확인한다.

```bash
mosquitto -v
```

명령어가 정상적으로 실행되면 Mosquitto가 설치된 상태이다.  
명령어가 인식되지 않으면 PATH 설정을 확인해야 한다.

\---

## 2\. PATH 설정 확인

CMD에서 `mosquitto` 명령어가 실행되지 않는 경우 아래 경로를 환경 변수 Path에 추가한다.

```text
C:\\\\Program Files\\\\mosquitto
```

설정 방법은 다음과 같다.

```text
윈도우 검색
→ 환경 변수
→ 시스템 환경 변수 편집
→ 환경 변수
→ 시스템 변수의 Path 선택
→ 편집
→ 새로 만들기
→ C:\\\\Program Files\\\\mosquitto 추가
```

설정 후에는 기존 CMD를 닫고 새 CMD를 다시 실행한다.

\---

## 3\. 브로커 설정 파일

브로커 설정 파일은 아래 위치에 둔다.

```text
broker/mosquitto.conf
```

설정 내용은 다음과 같다.

```conf
listener 1883 0.0.0.0
allow\\\_anonymous true

log\\\_type all
connection\\\_messages true
log\\\_timestamp true
```

각 설정의 의미는 다음과 같다.

```text
listener 1883 0.0.0.0
→ 1883 포트를 모든 네트워크 인터페이스에 개방함
→ ESP32 또는 다른 PC가 접속 가능함

allow\\\_anonymous true
→ 테스트 단계에서 ID/PW 없이 접속 허용

log\\\_type all
→ 브로커 로그 전체 출력

connection\\\_messages true
→ 클라이언트 접속/해제 로그 출력

log\\\_timestamp true
→ 로그에 시간 표시
```

\---

## 4\. 브로커 실행

아래 파일을 실행한다.

```text
start\\\_broker.bat
```

`start\\\_broker.bat` 내용은 다음과 같다.

```bat
@echo off
cd /d "%\\\~dp0"
mosquitto -c "%\\\~dp0broker\\\\mosquitto.conf" -v
pause
```

이 파일은 현재 폴더를 기준으로 `broker/mosquitto.conf` 설정 파일을 읽어 Mosquitto 브로커를 실행한다.  
따라서 프로젝트 폴더 위치가 달라져도 동일하게 실행할 수 있다.

\---

## 5\. 브로커 실행 확인

CMD에서 아래 명령어를 입력한다.

```bash
netstat -ano | findstr :1883
```

아래와 같이 출력되면 정상이다.

```text
TCP    0.0.0.0:1883    0.0.0.0:0    LISTENING
```

`0.0.0.0:1883`은 ESP32나 다른 PC가 해당 브로커에 접속할 수 있는 상태를 의미한다.

만약 아래처럼 출력되면 로컬 PC 내부에서만 접속 가능한 상태이다.

```text
TCP    127.0.0.1:1883    0.0.0.0:0    LISTENING
```

이 경우 ESP32 외부 접속이 어려울 수 있으므로 `mosquitto.conf`의 `listener 1883 0.0.0.0` 설정을 확인해야 한다.

\---

## 6\. 기존 Mosquitto 서비스 정지

Mosquitto가 Windows 서비스로 이미 실행 중이면 포트 충돌이 발생할 수 있다.

관리자 권한 CMD에서 아래 명령어를 입력한다.

```bash
net stop mosquitto
```

`시스템 오류 5`, `액세스가 거부되었습니다`가 출력되면 CMD를 관리자 권한으로 실행해야 한다.

또는 다음 방법으로 중지할 수 있다.

```text
Win + R
→ services.msc
→ Mosquitto Broker 또는 mosquitto 찾기
→ 우클릭
→ 중지
```

\---

## 7\. MQTT 메시지 수신 확인

아래 파일은 브로커에 들어오는 MQTT 메시지를 확인하기 위한 디버깅용 파일이다.

```text
subscribe\\\_all.bat
```

`subscribe\\\_all.bat` 내용은 다음과 같다.

```bat
@echo off
mosquitto\\\_sub -h 127.0.0.1 -p 1883 -t "terrarium/terrarium\\\_01/+/+" -v
pause
```

이 파일은 아래 토픽을 전체 구독한다.

```text
terrarium/terrarium\\\_01/+/+
```

즉, 다음 메시지들을 모두 확인할 수 있다.

```text
terrarium/terrarium\\\_01/esp32\\\_01/heartbeat
terrarium/terrarium\\\_01/esp32\\\_01/summary
terrarium/terrarium\\\_01/esp32\\\_01/event
terrarium/terrarium\\\_01/esp32\\\_01/alert
terrarium/terrarium\\\_01/esp32\\\_01/fault
```

`subscribe\\\_all.bat`은 실제 운용에 필수는 아니며, ESP32가 보낸 메시지가 브로커까지 들어오는지 확인할 때 사용한다.

\---

## 8\. MQTT Topic 구조

본 프로젝트의 MQTT topic 구조는 다음과 같다.

```text
terrarium/terrarium\\\_01/{node\\\_id}/{message\\\_type}
```

예시는 다음과 같다.

```text
terrarium/terrarium\\\_01/esp32\\\_01/heartbeat
terrarium/terrarium\\\_01/esp32\\\_01/summary
terrarium/terrarium\\\_01/esp32\\\_01/event
terrarium/terrarium\\\_01/esp32\\\_01/alert
terrarium/terrarium\\\_01/esp32\\\_01/fault
```

message\_type의 의미는 다음과 같다.

|message\_type|의미|
|-|-|
|heartbeat|ESP32 생존 확인|
|summary|normal 상태의 평시 요약 데이터|
|event|warning 상태 이벤트|
|alert|critical 상태 알림|
|fault|device\_fault 상태 보고|

\---

## 9\. Node.js 서버 접속 설정

Node.js 서버와 Mosquitto 브로커가 같은 PC에서 실행되는 경우 `.env`는 다음과 같이 설정한다.

```env
MQTT\\\_BROKER\\\_URL="mqtt://localhost:1883"
```

또는 다음과 같이 사용할 수 있다.

```env
MQTT\\\_BROKER\\\_URL="mqtt://127.0.0.1:1883"
```

Node.js 서버가 브로커와 다른 PC에서 실행되는 경우에는 브로커 PC의 IPv4 주소를 사용한다.

```env
MQTT\\\_BROKER\\\_URL="mqtt://브로커\\\_PC\\\_IP:1883"
```

예시는 다음과 같다.

```env
MQTT\\\_BROKER\\\_URL="mqtt://192.168.0.15:1883"
```

\---

## 10\. ESP32 접속 설정

ESP32는 `localhost` 또는 `127.0.0.1`을 사용하면 안 된다.

ESP32 기준 `localhost`는 브로커 PC가 아니라 ESP32 자기 자신을 의미한다.  
따라서 ESP32에는 브로커 PC의 IPv4 주소를 넣어야 한다.

브로커 PC의 IPv4 주소는 CMD에서 아래 명령어로 확인한다.

```bash
ipconfig
```

예를 들어 브로커 PC의 IPv4 주소가 `192.168.0.15`라면 ESP32의 MQTT 브로커 주소는 다음과 같다.

```text
mqtt://192.168.0.15:1883
```

\---

## 11\. 실제 실행 순서

실제 ESP32와 서버를 연결할 때 기본 실행 순서는 다음과 같다.

```text
1. start\\\_broker.bat 실행
2. Node.js 서버 실행
3. ESP32 전원 연결 및 실행
```

`subscribe\\\_all.bat`은 필수 실행 파일이 아니며, MQTT 메시지가 브로커에 들어오는지 확인할 때만 사용한다.

\---

## 12\. 테스트 단계 실행 순서

ESP32가 아직 없을 때는 다음 순서로 테스트한다.

```text
1. start\\\_broker.bat 실행
2. subscribe\\\_all.bat 실행
3. Node.js 서버 실행
4. mosquitto\\\_pub 명령어로 heartbeat 또는 summary 메시지 테스트 발행
```

heartbeat 테스트 발행 예시는 다음과 같다.

```bash
mosquitto\\\_pub -h 127.0.0.1 -p 1883 -t "terrarium/terrarium\\\_01/esp32\\\_01/heartbeat" -m "{\\\\"schema\\\\":\\\\"terrarium-diagnosis.v1\\\\",\\\\"node\\\_id\\\\":\\\\"esp32\\\_01\\\\",\\\\"timestamp\\\_ms\\\\":123456,\\\\"message\\\_type\\\\":\\\\"heartbeat\\\\",\\\\"state\\\\":\\\\"normal\\\\",\\\\"mqtt\\\_connected\\\\":true,\\\\"uptime\\\_ms\\\\":123456}"
```

`subscribe\\\_all.bat` 창 또는 Node.js 서버 콘솔에 메시지가 출력되면 정상이다.

\---

## 13\. 문제 해결

### 1\. `mosquitto` 명령어가 인식되지 않는 경우

PATH에 아래 경로가 등록되어 있는지 확인한다.

```text
C:\\\\Program Files\\\\mosquitto
```

### 2\. `각 소켓 주소는 하나만 사용할 수 있습니다` 오류가 발생하는 경우

이미 1883 포트를 사용하는 Mosquitto가 실행 중인 상태이다.  
기존 Mosquitto 서비스를 중지하거나 실행 중인 브로커 창을 종료한다.

### 3\. ESP32가 브로커에 접속하지 못하는 경우

다음을 확인한다.

```text
1. netstat에서 0.0.0.0:1883으로 열려 있는지 확인
2. ESP32와 브로커 PC가 같은 Wi-Fi/LAN에 있는지 확인
3. ESP32 코드에서 localhost가 아니라 브로커 PC IPv4 주소를 사용했는지 확인
4. Windows 방화벽에서 1883 포트가 차단되지 않았는지 확인
```

\---

## 14\. 요약

```text
1. Mosquitto 설치
2. PATH 설정 확인
3. broker/mosquitto.conf 작성
4. start\\\_broker.bat 실행
5. netstat으로 0.0.0.0:1883 확인
6. 필요 시 subscribe\\\_all.bat으로 메시지 수신 확인
```

