/*
 * wifi_manager.c
 *
 * 역할:
 * - ESP32를 WiFi station 모드로 초기화하고 AP에 연결함
 * - IP 주소를 획득할 때까지 대기해서 MQTT 시작 전에 네트워크 준비 상태를 보장함
 */

#include "wifi_manager.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

static const char *TAG = "wifi_manager";

// WiFi 연결 완료/실패를 app_main 초기화 흐름에 전달하기 위한 EventGroup bit
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT BIT1

static EventGroupHandle_t s_wifi_event_group; // WiFi 연결 결과를 기다릴 EventGroup
static esp_netif_t *s_wifi_netif; // 기본 WiFi station netif 핸들
static esp_event_handler_instance_t s_wifi_event_instance; // WIFI_EVENT 핸들러 등록 핸들
static esp_event_handler_instance_t s_ip_event_instance; // IP_EVENT 핸들러 등록 핸들
static bool s_wifi_initialized; // esp_wifi_init 수행 여부
static bool s_handlers_registered; // WiFi/IP 이벤트 핸들러 등록 여부
static uint8_t s_retry_count; // 현재 연결 재시도 횟수
static uint8_t s_max_retry_count; // 설정값으로 받은 최대 연결 재시도 횟수

// wifi_manager_string_is_empty:
// 문자열 설정값이 NULL 또는 빈 문자열인지 확인하는 함수
static bool wifi_manager_string_is_empty(const char *value)
{
    return value == NULL || value[0] == '\0';
}

// wifi_manager_init_nvs:
// WiFi 드라이버가 사용하는 NVS를 초기화하고 필요 시 NVS 영역을 정리하는 함수
static esp_err_t wifi_manager_init_nvs(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK_WITHOUT_ABORT(nvs_flash_erase());
        err = nvs_flash_init();
    }

    return err;
}

// wifi_manager_init_system:
// WiFi 연결에 필요한 NVS, esp-netif, event loop, station netif, WiFi 드라이버를 초기화하는 함수
static esp_err_t wifi_manager_init_system(void)
{
    esp_err_t err = wifi_manager_init_nvs();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_flash_init failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "esp_netif_init failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "esp_event_loop_create_default failed: %s", esp_err_to_name(err));
        return err;
    }

    if (s_wifi_event_group == NULL) {
        s_wifi_event_group = xEventGroupCreate();
        if (s_wifi_event_group == NULL) {
            return ESP_ERR_NO_MEM;
        }
    }

    if (s_wifi_netif == NULL) {
        s_wifi_netif = esp_netif_create_default_wifi_sta();
        if (s_wifi_netif == NULL) {
            return ESP_FAIL;
        }
    }

    if (!s_wifi_initialized) {
        wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
        err = esp_wifi_init(&init_config);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "esp_wifi_init failed: %s", esp_err_to_name(err));
            return err;
        }
        s_wifi_initialized = true;
    }

    return ESP_OK;
}

// wifi_manager_event_handler:
// WiFi 시작/연결 끊김/IP 획득 이벤트를 받아 연결 완료 또는 실패 상태를 갱신하는 콜백 함수
static void wifi_manager_event_handler(void *handler_args,
                                       esp_event_base_t event_base,
                                       int32_t event_id,
                                       void *event_data)
{
    (void)handler_args;

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_count < s_max_retry_count) {
            s_retry_count++;
            ESP_LOGW(TAG, "WiFi disconnected, retrying connection (%u/%u)",
                     (unsigned int)s_retry_count,
                     (unsigned int)s_max_retry_count);
            esp_wifi_connect();
        } else if (s_wifi_event_group != NULL) {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
        return;
    }

    if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *event = (const ip_event_got_ip_t *)event_data;
        s_retry_count = 0;
        ESP_LOGI(TAG, "WiFi connected, ip=" IPSTR, IP2STR(&event->ip_info.ip));
        if (s_wifi_event_group != NULL) {
            xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        }
    }
}

// wifi_manager_register_handlers:
// WiFi 연결 상태를 추적하기 위한 WIFI_EVENT와 IP_EVENT 핸들러를 등록하는 함수
static esp_err_t wifi_manager_register_handlers(void)
{
    if (s_handlers_registered) {
        return ESP_OK;
    }

    esp_err_t err = esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        wifi_manager_event_handler,
                                                        NULL,
                                                        &s_wifi_event_instance);
    if (err != ESP_OK) {
        return err;
    }

    err = esp_event_handler_instance_register(IP_EVENT,
                                              IP_EVENT_STA_GOT_IP,
                                              wifi_manager_event_handler,
                                              NULL,
                                              &s_ip_event_instance);
    if (err != ESP_OK) {
        esp_event_handler_instance_unregister(WIFI_EVENT,
                                              ESP_EVENT_ANY_ID,
                                              s_wifi_event_instance);
        return err;
    }

    s_handlers_registered = true;
    return ESP_OK;
}

// wifi_manager_config_is_valid:
// WiFi station 연결에 필요한 SSID, password, timeout 설정값을 검증하는 함수
static bool wifi_manager_config_is_valid(const wifi_manager_config_t *config)
{
    return config != NULL &&
           !wifi_manager_string_is_empty(config->ssid) &&
           strlen(config->ssid) < sizeof(((wifi_config_t *)0)->sta.ssid) &&
           (config->password == NULL ||
            strlen(config->password) < sizeof(((wifi_config_t *)0)->sta.password)) &&
           config->connect_timeout_ms > 0U;
}

// 공개 API 구현

// wifi_manager_get_default_config:
// Kconfig에 설정된 기본 WiFi 연결값을 wifi_manager_config_t에 저장하는 함수
void wifi_manager_get_default_config(wifi_manager_config_t *out_config)
{
    if (out_config == NULL) {
        return;
    }

    *out_config = (wifi_manager_config_t){
        .ssid = CONFIG_TERRARIUM_WIFI_SSID,
        .password = CONFIG_TERRARIUM_WIFI_PASSWORD,
        .connect_timeout_ms = CONFIG_TERRARIUM_WIFI_CONNECT_TIMEOUT_MS,
        .max_retry_count = CONFIG_TERRARIUM_WIFI_MAX_RETRY_COUNT,
    };
}

// wifi_manager_connect:
// ESP32를 station 모드로 설정하고 AP 연결과 IP 주소 획득이 끝날 때까지 대기하는 함수
esp_err_t wifi_manager_connect(const wifi_manager_config_t *config)
{
    wifi_manager_config_t effective_config;

    if (config == NULL) {
        wifi_manager_get_default_config(&effective_config);
    } else {
        effective_config = *config;
    }

    if (!wifi_manager_config_is_valid(&effective_config)) {
        ESP_LOGW(TAG, "WiFi config is invalid or SSID is empty");
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = wifi_manager_init_system();
    if (err != ESP_OK) {
        return err;
    }

    err = wifi_manager_register_handlers();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "failed to register WiFi event handlers: %s", esp_err_to_name(err));
        return err;
    }

    wifi_config_t wifi_config = {0};
    snprintf((char *)wifi_config.sta.ssid,
             sizeof(wifi_config.sta.ssid),
             "%s",
             effective_config.ssid);
    snprintf((char *)wifi_config.sta.password,
             sizeof(wifi_config.sta.password),
             "%s",
             effective_config.password == NULL ? "" : effective_config.password);
    wifi_config.sta.threshold.authmode =
        wifi_manager_string_is_empty(effective_config.password) ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK;

    s_retry_count = 0;
    s_max_retry_count = effective_config.max_retry_count;
    xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);

    err = esp_wifi_set_storage(WIFI_STORAGE_RAM);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "esp_wifi_set_storage failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_wifi_set_mode(WIFI_MODE_STA);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "esp_wifi_set_mode failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "esp_wifi_set_config failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_wifi_start();
    if (err != ESP_OK && err != ESP_ERR_WIFI_CONN) {
        ESP_LOGW(TAG, "esp_wifi_start failed: %s", esp_err_to_name(err));
        return err;
    }

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE,
                                           pdFALSE,
                                           pdMS_TO_TICKS(effective_config.connect_timeout_ms));

    if ((bits & WIFI_CONNECTED_BIT) != 0) {
        return ESP_OK;
    }

    if ((bits & WIFI_FAIL_BIT) != 0) {
        ESP_LOGW(TAG, "failed to connect to WiFi SSID=%s", effective_config.ssid);
        return ESP_FAIL;
    }

    ESP_LOGW(TAG, "timed out while connecting to WiFi SSID=%s", effective_config.ssid);
    return ESP_ERR_TIMEOUT;
}

// wifi_manager_disconnect:
// WiFi 연결을 해제하고 station 동작을 정지하는 함수
esp_err_t wifi_manager_disconnect(void)
{
    if (!s_wifi_initialized) {
        return ESP_OK;
    }

    esp_err_t disconnect_err = esp_wifi_disconnect();
    if (disconnect_err != ESP_OK && disconnect_err != ESP_ERR_WIFI_NOT_STARTED) {
        ESP_LOGW(TAG, "esp_wifi_disconnect failed: %s", esp_err_to_name(disconnect_err));
        return disconnect_err;
    }

    esp_err_t stop_err = esp_wifi_stop();
    if (stop_err != ESP_OK && stop_err != ESP_ERR_WIFI_NOT_STARTED) {
        ESP_LOGW(TAG, "esp_wifi_stop failed: %s", esp_err_to_name(stop_err));
        return stop_err;
    }

    if (s_wifi_event_group != NULL) {
        xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);
    }

    return ESP_OK;
}
