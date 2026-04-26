/*
 * main.c
 *
 * 역할:
 * - 시스템 전체 초기화 및 실행 흐름을 관리하는 진입점
 * - 지금은 sensors 모듈만 호출해서 온도센서 3개와 조도센서 1개 값을 테스트함
 */

#include <stdio.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_err.h"
#include "esp_log.h"

#include "sensors.h"

static const char *TAG = "app_main";

#define SENSOR_READ_INTERVAL_MS (30 * 1000) // 센서 읽기 시작 기준 간격 (밀리초)
#define SENSOR_INIT_RETRY_DELAY_MS 3000 // 센서 초기화 실패 시 재시도하기 전에 대기하는 시간 (밀리초)
#define SENSOR_RECOVERY_THRESHOLD 3 // 센서 읽기 실패가 연속으로 발생했을 때 재초기화를 시도하는 임계값

// wait_for_sensor_ready:
// 센서 초기화가 성공할 때까지 재시도하는 함수
static void wait_for_sensor_ready(void)
{
    esp_err_t err = ESP_OK;

    do {
        err = sensors_init();
        if (err == ESP_OK) {
            return;
        }

        ESP_LOGE(TAG, "sensor init failed: %s", esp_err_to_name(err));
        vTaskDelay(pdMS_TO_TICKS(SENSOR_INIT_RETRY_DELAY_MS));
    } while (1);
}

void app_main(void)
{
    unsigned int consecutive_read_failures = 0; // 센서 읽기 실패가 연속으로 발생한 횟수를 추적하는 변수

    // 센서 초기화 시도 및 준비될 때까지 대기
    wait_for_sensor_ready();
    TickType_t last_wake_time = xTaskGetTickCount();

    // 메인 루프: 센서 데이터를 주기적으로 읽어서 출력
    while (1) {
        sensor_data_t sensor_data = {0};
        esp_err_t err = sensors_read_all(&sensor_data);

        // 온도 센서 3개와 조도 센서 읽기에 성공했는지 확인하고, 센서값이 유효한지 검사
        if (err == ESP_OK && sensor_data.hot_surface_ok && sensor_data.hot_air_ok &&
            sensor_data.cool_air_ok && sensor_data.light_ok) {
            consecutive_read_failures = 0;
            printf("Hot surface temp: %.2f C, Hot air temp: %.2f C, Cool air temp: %.2f C, Light: %d lux\n",
                   sensor_data.hot_surface_temp_c,
                   sensor_data.hot_air_temp_c,
                   sensor_data.cool_air_temp_c,
                   sensor_data.light_level);
        } else {
            consecutive_read_failures++;
            ESP_LOGW(TAG, "sensor read failed: %s", esp_err_to_name(err));

            // 실패가 일정 횟수 이상 연속되면 센서 재초기화 시도
            if (err == ESP_ERR_INVALID_STATE || consecutive_read_failures >= SENSOR_RECOVERY_THRESHOLD) {
                ESP_LOGW(TAG, "reinitializing sensors after %u consecutive failures",
                         consecutive_read_failures);
                sensors_deinit();
                wait_for_sensor_ready();
                consecutive_read_failures = 0;
                last_wake_time = xTaskGetTickCount();
            }
        }

        // 다음 30초 주기까지 대기
        vTaskDelayUntil(&last_wake_time, pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS));
    }
}
