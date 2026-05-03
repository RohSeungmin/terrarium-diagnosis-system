# API 명세서

## 기본 규칙
- 형식: JSON
- 필드명: snake_case
- 시간: ISO 8601
- 결측값: null
- state: `normal | warning | critical | device_fault`

## 공통 응답

### 성공
```json
{
  "ok": true,
  "data": { ... }
}
```

### 실패
```json
{
  "ok": false,
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "node_id 'node-01'을 찾을 수 없음"
  }
}
```

## HTTP 상태 코드
- 200: 조회/수정 성공
- 201: 생성 성공
- 204: 삭제 성공
- 400: 입력값 오류
- 404: 리소스 없음
- 409: 중복
- 500: 서버 오류

---

## 1. Node

### `GET /api/nodes`
모든 노드 조회.

**Response 200**
```json
{
  "ok": true,
  "data": [
    {
      "node_id": "node-01",
      "name": "메인 사육장",
      "location": "1번 사육장",
      "created_at": "2026-04-12T20:00:00+09:00",
      "updated_at": "2026-04-12T20:00:00+09:00",
      "last_seen_at": "2026-04-12T20:30:00+09:00"
    }
  ]
}
```

### `POST /api/nodes`
신규 노드 등록.

**Request**
```json
{
  "node_id": "node-01",
  "name": "메인 사육장",
  "location": "1번 사육장"
}
```

### `GET /api/nodes/:node_id`
특정 노드 조회.

### `PATCH /api/nodes/:node_id`
노드 정보 수정.

**Request**
```json
{
  "name": "변경된 이름",
  "location": "새 위치"
}
```

### `DELETE /api/nodes/:node_id`
노드 삭제. 연결된 모든 메시지/이력 cascade 삭제.

---

## 2. Heartbeat

### `POST /api/heartbeat`
heartbeat 수신.

**Request**
```json
{
  "timestamp": "2026-04-12T20:00:00+09:00",
  "node_id": "node-01",
  "message_type": "heartbeat"
}
```

처리:
1. `heartbeats` 테이블에 record 추가
2. `nodes.last_seen_at`을 timestamp로 갱신
3. 직전 상태가 device_fault였으면 `mode_transitions`에 기록

**Response 200**
```json
{
  "ok": true,
  "data": {
    "node_id": "node-01",
    "received_at": "2026-04-12T20:00:00+09:00"
  }
}
```

### `GET /api/nodes/:node_id/heartbeat/latest`
가장 최근 heartbeat 1건.

### `GET /api/nodes/:node_id/heartbeat/history`
heartbeat 이력.

**Query**: `from`, `to`, `limit`

---

## 3. Summary

### `POST /api/summary`
평시 요약 저장.

**Request**
```json
{
  "timestamp": "2026-04-12T20:00:00+09:00",
  "node_id": "node-01",
  "message_type": "summary",
  "state": "normal",
  "surface_temp_c": 39.2,
  "hot_air_temp_c": 34.8,
  "cool_air_temp_c": 27.1,
  "light_level": 812,
  "heat_source_on": true,
  "l_match": 0,
  "l_grad": 0,
  "l_safety": 0,
  "l_final": 0,
  "fault_reason": null
}
```

### `GET /api/nodes/:node_id/summary`
요약 이력.

**Query**: `from`, `to`, `limit`

---

## 4. Event

### `POST /api/event`
warning 이벤트 저장.

**Request**
```json
{
  "timestamp": "2026-04-12T20:05:00+09:00",
  "node_id": "node-01",
  "message_type": "event",
  "state": "warning",
  "surface_temp_c": 41.5,
  "hot_air_temp_c": 36.0,
  "cool_air_temp_c": 28.0,
  "light_level": 800,
  "heat_source_on": true,
  "l_match": 0,
  "l_grad": 1,
  "l_safety": 0,
  "l_final": 1,
  "fault_reason": null
}
```

### `GET /api/event`
모든 이벤트 조회.

**Query**: `node_id`, `from`, `to`, `limit`

### `GET /api/nodes/:node_id/event`
특정 노드 이벤트 이력.

---

## 5. Alert

### `POST /api/alert`
critical 알림 저장.

**Request**
```json
{
  "timestamp": "2026-04-12T20:10:00+09:00",
  "node_id": "node-01",
  "message_type": "alert",
  "state": "critical",
  "surface_temp_c": 45.2,
  "hot_air_temp_c": 38.0,
  "cool_air_temp_c": 28.5,
  "light_level": 800,
  "heat_source_on": true,
  "l_match": 0,
  "l_grad": 1,
  "l_safety": 2,
  "l_final": 2,
  "fault_reason": null
}
```

### `GET /api/alert`
모든 알림 조회.

### `GET /api/nodes/:node_id/alert`
특정 노드 알림 이력.

---

## 6. Fault

### `POST /api/fault`
장치 이상 보고.

**Request**
```json
{
  "timestamp": "2026-04-12T20:15:00+09:00",
  "node_id": "node-01",
  "message_type": "fault",
  "state": "device_fault",
  "surface_temp_c": null,
  "hot_air_temp_c": 36.0,
  "cool_air_temp_c": 28.0,
  "light_level": 800,
  "heat_source_on": true,
  "l_match": null,
  "l_grad": null,
  "l_safety": null,
  "l_final": null,
  "fault_reason": "surface_temp_c 60초간 갱신 없음"
}
```

### `GET /api/fault`
모든 fault 조회.

### `GET /api/nodes/:node_id/fault`
특정 노드 fault 이력.

---

## 7. Mode Transition

### `GET /api/nodes/:node_id/transitions`
상태 전이 이력 조회.

**Response 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "node_id": "node-01",
      "timestamp": "2026-04-12T20:05:00+09:00",
      "from_state": "normal",
      "to_state": "warning",
      "reason": "l_grad=1"
    }
  ]
}
```

### `GET /api/nodes/:node_id/transitions/diagnostic-entries`
진단 모드 진입 시점만 필터링.

---

## 8. Dashboard

### `GET /api/dashboard/overview`
전체 시스템 현황.

**Response 200**
```json
{
  "ok": true,
  "data": {
    "total_nodes": 5,
    "online_nodes": 4,
    "offline_nodes": 1,
    "active_warnings": 2,
    "active_criticals": 0,
    "active_faults": 1
  }
}
```

### `GET /api/dashboard/temperature-trend`
온도 추이.

**Query**: `node_id`, `from`, `to`, `interval` (예: `1m` / `5m` / `1h`)

**Response 200**
```json
{
  "ok": true,
  "data": [
    {
      "timestamp": "2026-04-12T20:00:00+09:00",
      "surface_temp_c": 39.2,
      "hot_air_temp_c": 34.8,
      "cool_air_temp_c": 27.1
    }
  ]
}
```

### `GET /api/dashboard/gradient-changes`
온도구배 변화 (G = `hot_air_temp_c − cool_air_temp_c`).

### `GET /api/dashboard/diagnostic-mode-entries`
진단 모드 진입 시점.

### `GET /api/dashboard/node-sensor-status`
노드·센서 상태 기록.

### `GET /api/dashboard/latest`
각 노드의 최신 측정값과 진단 결과.

---

## 9. MQTT 토픽

```
terrarium/<node_id>/summary
terrarium/<node_id>/event
terrarium/<node_id>/alert
terrarium/<node_id>/fault
terrarium/<node_id>/heartbeat
```

| state | topic | QoS | Expiry |
|-------|-------|-----|--------|
| normal | summary | 0 | 30s |
| warning | event | 1 | 300s |
| critical | alert | 1 | 1800s |
| device_fault | fault | 1 | 600s |

메시지 페이로드는 data-spec.md 규격을 따른다.

---

## 10. 환경 변수

`backend/.env`

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/railway"
PORT=3000
MQTT_BROKER_URL="mqtts://broker.example.com:8883"
HEARTBEAT_THRESHOLD_OFFLINE_SEC=60
HEARTBEAT_CHECK_INTERVAL_SEC=30
```
