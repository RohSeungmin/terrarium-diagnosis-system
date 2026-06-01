# 데이터 규격

본 문서는 ESP32 진단 노드가 MQTT v5.0 기반으로 서버에 전송하는 JSON payload 규격을 정의한다.  
ESP32는 센서 데이터 수집, 전처리, 로컬 진단, 상태 분류를 수행한 뒤 상태별 MQTT topic으로 메시지를 발행한다.  
서버는 topic별로 필요한 데이터를 선택적으로 구독하여 저장, 알림, 대시보드 표시 등에 사용할 수 있다.

## MQTT Topic 구조

MQTT topic은 다음 형식을 사용한다.

```text
{topic_prefix}/{node_id}/{message_type}
```

기본 topic 예시는 다음과 같다.

```text
terrarium/terrarium_01/esp32_01/summary
terrarium/terrarium_01/esp32_01/event
terrarium/terrarium_01/esp32_01/alert
terrarium/terrarium_01/esp32_01/fault
terrarium/terrarium_01/esp32_01/heartbeat
```

`topic_prefix`는 사육장 또는 설치 단위를 구분하기 위한 prefix이며, 기본값은 `terrarium/terrarium_01`이다.  
`node_id`는 ESP32 노드 식별자이며, 기본값은 `esp32_01`이다.  
서버는 `summary`, `event`, `alert`, `fault`, `heartbeat` topic을 목적에 따라 선택적으로 구독할 수 있다.

## 기본 규칙

모든 payload는 JSON object 형식이다. 필드명은 `snake_case`를 사용한다.  
값이 없거나 해당되지 않는 경우, 또는 센서값이 유효하지 않은 경우에는 `null`을 사용한다.

ESP32가 생성하는 시간 정보는 `timestamp_ms`로 표현한다.  
이 값은 ESP32 부팅 후 경과 시간이며 단위는 ms이다. 서버에서 메시지를 수신한 시각은 서버가 별도로 `received_at` 필드에 ISO 8601 형식으로 저장하는 것을 권장한다.

온도 값의 단위는 섭씨 `C`이며, 시간 값의 단위는 ms이다.  
서버는 상태 판단을 다시 수행하지 않고, ESP32가 전송한 `state`, `message_type`, `diagnosis`, `sensor_status`를 기준으로 저장, 알림, 대시보드 표시를 처리한다.

## 메시지 종류

`summary` 메시지는 normal 상태에서 발행되는 평시 요약 메시지이다.  
불필요한 원시 데이터 전송을 줄이기 위해 저주기로 전송되며, 온도 요약값, 온도구배 요약값, 열원 작동 상태, 센서 상태 등을 포함한다.

`event` 메시지는 warning 상태 또는 상태 전이 시 발행되는 이벤트 메시지이다.  
현재 센서값, 진단 feature, 진단 결과, 상태 전이 여부, 센서 상태를 포함한다.

`alert` 메시지는 critical 상태의 긴급 진단 정보 또는 critical 상태 해제/전이 알림을 전달하는 메시지이다.

`fault` 메시지는 device_fault 상태에서 발행되는 장치 이상 메시지이다.  
센서 응답 실패, 결측, 비정상 범위, 비정상 범위 지속, 동일값 반복, 센서별 정상 여부, fault 원인 등을 포함한다.

`heartbeat` 메시지는 진단 메시지가 아니라 노드 생존 확인용 메시지이다.  
서버는 heartbeat 수신 시각을 기준으로 노드 online/offline 여부를 판단할 수 있다.

## MQTT 전송 정책

메시지별 기본 전송 정책은 다음과 같다.  
`summary`는 QoS 0, retain false, message expiry 30초를 사용한다.  
`event`는 QoS 1, retain false, message expiry 300초를 사용한다.  
`alert`는 QoS 1, retain false, message expiry 1800초를 사용한다.  
`fault`는 QoS 1, retain false, message expiry 600초를 사용한다.  
`heartbeat`는 QoS 0, retain false를 사용하며, message expiry는 heartbeat 발행 주기의 2배를 사용한다.

`summary`, `event`, `alert`, `fault` 메시지에는 `message_expiry_ms` 필드가 payload metadata로 포함된다.  
또한 MQTT v5 Message Expiry Interval property에도 같은 정책값이 적용된다.  
단, MQTT v5 property는 초 단위이므로 ESP32 내부에서 ms 값을 초 단위로 변환하여 설정한다.

## 공통 필드

`summary`, `event`, `alert`, `fault` 메시지는 공통 필드를 포함한다.  
`schema`는 payload schema 이름이며 기본값은 `terrarium-diagnosis.v1`이다.  
`node_id`는 노드 식별자이다. `timestamp_ms`는 ESP32 부팅 후 경과 시간이다.  
`state`는 현재 상태이며 `normal`, `warning`, `critical`, `device_fault` 중 하나이다.  
`message_type`은 메시지 종류이며 `summary`, `event`, `alert`, `fault` 중 하나이다.

`state_changed`는 상태 전이 여부를 나타낸다.  
`qos`는 MQTT QoS 값이다. `retain`은 MQTT retain 여부이다.  
`message_expiry_ms`는 메시지 유효 시간이며 단위는 ms이다.

공통 필드 예시는 다음과 같다.

```json
{
  "schema": "terrarium-diagnosis.v1",
  "node_id": "esp32_01",
  "timestamp_ms": 123456,
  "state": "normal",
  "message_type": "summary",
  "state_changed": false,
  "qos": 0,
  "retain": false,
  "message_expiry_ms": 30000
}
```

## summary 메시지

`summary` 메시지는 normal 상태에서 발행되는 평시 요약 메시지이다.  
공통 필드 외에 `summary`, `heat_source`, `sensor_status` 객체를 포함한다.

`summary` 객체는 `ready`, `window_sample_count`, `window_capacity`를 포함한다.  
`ready`는 요약 window가 충분히 준비되었는지 여부이고, `window_sample_count`는 현재 window에 누적된 샘플 수이며, `window_capacity`는 summary window의 최대 샘플 수이다.  
또한 `summary` 객체에는 요약 window 기준의 센서 요약값이 포함된다.  
포함 항목은 `hot_surface_temp_c`, `hot_air_temp_c`, `cool_air_temp_c`, `light_level`, `temp_gradient_c`이다. 각 항목은 `ok`, `sample_count`, `average`, `min`, `max`를 가진다.  
값이 유효하지 않으면 `average`, `min`, `max`는 `null`로 전송된다.

`heat_source` 객체는 열원 상태를 나타낸다.  
`state_ok`는 열원 상태 정보가 유효한지 여부이고, `on`은 열원 작동 여부이며, `on_duration_ms`는 열원이 켜진 상태로 유지된 시간이다.

## event 및 alert 메시지

`event`와 `alert` 메시지는 상세 진단 메시지이다.  
공통 필드 외에 `sensor_values`, `features`, `diagnosis`, `state_transition`, `sensor_status` 객체를 포함한다.

`sensor_values` 객체는 현재 전처리된 센서값을 포함한다.  
`hot_surface_temp_c`는 온열 구역 표면 온도, `hot_air_temp_c`는 온열 구역 공기 온도, `cool_air_temp_c`는 냉각 구역 공기 온도, `light_level`은 조도값이다. 각 센서값이 유효하지 않으면 해당 값은 `null`로 전송된다.

`features` 객체는 진단에 사용된 계산값을 포함한다.  
`temp_gradient_c`는 온도구배, `heat_source_on`은 열원 작동 여부, `heat_source_on_since_ms`는 열원 ON 시작 시각, `heat_source_on_duration_ms`는 열원 ON 지속 시간이다.  
`surface_temp_step_delta_c`는 직전 측정 대비 표면 온도 변화량이며, `surface_temp_rise_since_heat_on_c`는 열원 ON 이후 표면 온도 상승량이다.  
각 계산값에는 유효 여부를 나타내는 `*_ok` 필드가 함께 포함된다.
열원 관련 값은 항상 포함되며, 서버는 `heat_source_state_ok`가 false인 경우 해당 열원 상태 값을 신뢰하지 않는 방식으로 처리한다.

`diagnosis` 객체는 로컬 진단 결과를 포함한다.  
`status`는 진단 상태이며 `normal`, `warning`, `critical`, `device_fault` 중 하나이다.  
`l_match`, `l_grad`, `l_safety`, `l_fault`, `l_final`은 진단 레벨 값이다. `cause_flags`는 이상 원인 플래그이며, `fault_reason`은 장치 이상 원인이다.

`state_transition` 객체는 상태 전이 정보를 포함한다.  
현재는 `state_changed` 필드를 포함하며, 상태가 이전 상태에서 변경되었는지를 나타낸다.

## fault 메시지

`fault` 메시지는 device_fault 상태에서 발행되는 장치 이상 메시지이다.  
공통 필드 외에 `fault`, `sensor_values`, `sensor_status`, `diagnosis` 객체를 포함한다.

`fault` 객체는 장치 이상 여부와 원인을 포함한다.  
`sensor_response_failure`는 센서 응답 실패 여부, `missing_value`는 결측 여부, `out_of_range_value`는 비정상 범위 값 여부, `persistent_out_of_range_value`는 비정상 범위 지속 여부, `repeated_value`는 동일값 반복 여부이다. `fault_reason`은 fault 원인을 문자열 또는 `null`로 표현한다.

## heartbeat 메시지

`heartbeat` 메시지는 노드 생존 확인용 메시지이다.  
진단 상세 데이터는 포함하지 않는다.  
서버는 heartbeat payload의 `timestamp_ms`가 아니라 서버가 메시지를 수신한 시각인 `received_at`을 기준으로 offline 여부를 판단하는 것을 권장한다.

heartbeat payload는 `schema`, `node_id`, `timestamp_ms`, `message_type`, `state`, `mqtt_connected`, `uptime_ms`를 포함한다.  
heartbeat payload에는 `qos`, `retain`, `message_expiry_ms` 필드를 포함하지 않는다. 해당 값은 MQTT 발행 정책으로만 적용된다.  
`message_type`은 항상 `heartbeat`이다. `state`는 ESP32가 마지막으로 정상 계산한 시스템 상태이다.  
`mqtt_connected`는 heartbeat payload 생성 시점의 MQTT 연결 상태이다.  
현재 구현에서는 MQTT가 연결된 경우에만 heartbeat를 발행하므로, 서버가 수신하는 heartbeat의 `mqtt_connected`는 일반적으로 true이다.
`uptime_ms`는 ESP32 부팅 후 경과 시간이다.

heartbeat 예시는 다음과 같다.

```json
{
  "schema": "terrarium-diagnosis.v1",
  "node_id": "esp32_01",
  "timestamp_ms": 123456,
  "message_type": "heartbeat",
  "state": "normal",
  "mqtt_connected": true,
  "uptime_ms": 123456
}
```

## sensor_status 객체

`sensor_status` 객체는 센서 및 전처리 상태를 나타낸다.  
`usable_for_diagnosis`는 현재 데이터가 진단에 사용 가능한지 여부이다.  
`response_failure`는 센서 응답 실패 여부이다. `missing_value`는 결측 여부이다.  
`out_of_range_value`는 비정상 범위 값 여부이다.  
`persistent_out_of_range_value`는 비정상 범위 지속 여부이다.  
`repeated_value`는 동일값 반복 여부이다.

`hot_surface_ok`는 온열 구역 표면 온도 센서 정상 여부이다.  
`hot_air_ok`는 온열 구역 공기 온도 센서 정상 여부이다.  
`cool_air_ok`는 냉각 구역 공기 온도 센서 정상 여부이다.  
`light_ok`는 조도 센서 정상 여부이다.

예시는 다음과 같다.

```json
{
  "usable_for_diagnosis": true,
  "response_failure": false,
  "missing_value": false,
  "out_of_range_value": false,
  "persistent_out_of_range_value": false,
  "repeated_value": false,
  "hot_surface_ok": true,
  "hot_air_ok": true,
  "cool_air_ok": true,
  "light_ok": true
}
```

## 서버 저장 권장 사항

서버는 모든 메시지에 대해 `schema`, `node_id`, `message_type`, `state`, `timestamp_ms`, `received_at`을 공통 인덱싱 필드로 저장하는 것을 권장한다.  
`received_at`은 서버 수신 시각이며 ISO 8601 형식으로 저장한다.

저장 모듈은 `summary`, `event`, `alert`, `fault`를 저장 대상으로 처리한다.  
알림 모듈은 `event`, `alert`, `fault`를 중심으로 구독하여 사용자 알림을 처리한다.  
대시보드 연동 모듈은 최신 상태, 온도 추이, 온도구배 변화, 진단 모드 진입 시점, 노드 및 센서 상태 기록을 표시한다.

노드 offline 판단은 `heartbeat` topic의 마지막 서버 수신 시각을 기준으로 한다.  
예를 들어 heartbeat 주기가 30초이면, 서버는 마지막 `received_at` 이후 일정 시간 이상 heartbeat가 수신되지 않을 때 해당 노드를 offline으로 표시할 수 있다.
