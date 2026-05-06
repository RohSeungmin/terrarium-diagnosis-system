#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *ssid; // 연결할 WiFi SSID
    const char *password; // 연결할 WiFi 비밀번호. open network인 경우 빈 문자열 사용
    uint32_t connect_timeout_ms; // IP 획득까지 기다릴 최대 시간 (밀리초)
    uint8_t max_retry_count; // 연결 실패 시 재시도할 최대 횟수
} wifi_manager_config_t;

// wifi_manager_get_default_config:
// Kconfig에 설정된 기본 WiFi 연결값을 가져오는 함수
void wifi_manager_get_default_config(wifi_manager_config_t *out_config);

// wifi_manager_connect:
// WiFi station 모드로 AP에 연결하고 IP 획득까지 대기하는 함수
esp_err_t wifi_manager_connect(const wifi_manager_config_t *config);

// wifi_manager_disconnect:
// WiFi 연결을 해제하고 station 동작을 정지하는 함수
esp_err_t wifi_manager_disconnect(void);

#ifdef __cplusplus
}
#endif

#endif
