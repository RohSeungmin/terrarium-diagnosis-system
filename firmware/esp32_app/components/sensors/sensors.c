/*
 * sensors.c
 *
 * 역할:
 * - 사육장에 연결된 센서들의 값을 읽어오는 모듈
 * - 온열 구역 표면 온도, 온열 구역 공기 온도, 냉각 구역 공기 온도, 조도값을 수집함
 * - 센서 읽기 실패 여부와 기본적인 값 유효성도 함께 확인함
 * 
 */

#include "sensors.h"
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "onewire_bus.h"
#include "onewire_device.h"
#include "ds18b20.h"

static const char *TAG = "sensors";

// DS18B20 관련 정의
#define DS18B20_GPIO GPIO_NUM_4 // DS18B20 센서가 연결된 GPIO 핀 번호
#define DS18B20_SENSOR_COUNT 3 // 현재 사용하는 DS18B20 센서 개수
#define DS18B20_MIN_TEMP_C (-55.0f) // DS18B20 센서의 최소 온도 범위
#define DS18B20_MAX_TEMP_C (125.0f) // DS18B20 센서의 최대 온도 범위

// BH1750 관련 정의
#define BH1750_I2C_PORT I2C_NUM_0 // BH1750 센서가 연결된 I2C 포트 번호
#define BH1750_SDA_GPIO GPIO_NUM_21 // BH1750 센서의 SDA 핀 GPIO 번호
#define BH1750_SCL_GPIO GPIO_NUM_22 // BH1750 센서의 SCL 핀 GPIO 번호
#define BH1750_I2C_FREQ_HZ 100000 // BH1750 센서의 I2C 통신 속도
#define BH1750_I2C_TIMEOUT_MS 1000 // BH1750 센서의 I2C 통신 타임아웃 (밀리초)
#define BH1750_ADDR_LOW 0x23 // BH1750 센서의 가능한 I2C 주소 (ADDR 핀 LOW)
#define BH1750_ADDR_HIGH 0x5C // BH1750 센서의 가능한 I2C 주소 (ADDR 핀 HIGH)
#define BH1750_CMD_POWER_ON 0x01 // BH1750 센서의 전원 켜기 명령
#define BH1750_CMD_RESET 0x07 // BH1750 센서의 리셋 명령
#define BH1750_CMD_ONE_TIME_HIGH_RES 0x20 // BH1750 센서의 1회 측정 고해상도 모드 명령
#define BH1750_MEASUREMENT_DELAY_MS 180 // BH1750 센서의 측정 지연 시간 (밀리초)
#define BH1750_LUX_SCALE 1.2f // BH1750 센서의 raw 값에서 럭스 단위로 변환하기 위한 스케일링 팩터

// 전역 변수: 센서 핸들을 저장하는 변수들
static onewire_bus_handle_t s_bus = NULL; // 1-Wire 버스 핸들
static ds18b20_device_handle_t s_ds18b20[DS18B20_SENSOR_COUNT] = {0}; // DS18B20 센서 핸들
static size_t s_ds18b20_count = 0; // 발견된 DS18B20 센서 개수
static i2c_master_bus_handle_t s_i2c_bus = NULL; // I2C 버스 핸들
static i2c_master_dev_handle_t s_bh1750 = NULL; // BH1750 센서 핸들

// sensors_reset_data:
// 센서 데이터 구조체를 초기화하는 함수
static void sensors_reset_data(sensor_data_t *out_data)
{
    out_data->hot_surface_temp_c = 0.0f;
    out_data->hot_air_temp_c = 0.0f;
    out_data->cool_air_temp_c = 0.0f;
    out_data->light_level = 0;
    out_data->hot_surface_ok = false;
    out_data->hot_air_ok = false;
    out_data->cool_air_ok = false;
    out_data->light_ok = false;
}

// sensors_is_valid_temperature:
// DS18B20 센서에서 읽은 온도 값이 유효한지 검사
static bool sensors_is_valid_temperature(float temp_c)
{
    // 온도가 유한한 숫자인지, DS18B20의 허용 범위 내에 있는지 확인
    return isfinite(temp_c) && temp_c >= DS18B20_MIN_TEMP_C && temp_c <= DS18B20_MAX_TEMP_C;
}

// sensors_store_ds18b20_reading:
// DS18B20 센서에서 읽은 온도 값을 sensor_data_t 구조체에 저장하는 함수
static void sensors_store_ds18b20_reading(sensor_data_t *out_data, size_t index, float temp_c)
{
    // index에 따라 온열 구역 표면 온도, 온열 구역 공기 온도, 냉각 구역 공기 온도 중 하나에 값을 저장하고, 해당 센서의 OK 플래그를 true로 설정
    switch (index) {
    case 0:
        out_data->hot_surface_temp_c = temp_c;
        out_data->hot_surface_ok = true;
        break;
    case 1:
        out_data->hot_air_temp_c = temp_c;
        out_data->hot_air_ok = true;
        break;
    case 2:
        out_data->cool_air_temp_c = temp_c;
        out_data->cool_air_ok = true;
        break;
    default:
        break;
    }
}

// sensors_probe_bh1750_address:
// BH1750 센서가 연결된 I2C 주소를 탐색하는 함수
static esp_err_t sensors_probe_bh1750_address(i2c_master_bus_handle_t bus, uint16_t *address)
{
    // BH1750 센서는 ADDR 핀 상태에 따라 0x23 또는 0x5C의 주소를 가질 수 있으므로, 두 주소 모두 탐색
    const uint16_t candidates[] = {
        BH1750_ADDR_LOW,
        BH1750_ADDR_HIGH,
    };
    esp_err_t result = ESP_ERR_NOT_FOUND;

    // 후보 주소들을 순회하면서 BH1750 센서가 응답하는지 확인
    for (size_t i = 0; i < sizeof(candidates) / sizeof(candidates[0]); i++) {
        esp_err_t err = i2c_master_probe(bus, candidates[i], BH1750_I2C_TIMEOUT_MS);
        if (err == ESP_OK) {
            *address = candidates[i];
            return ESP_OK;
        }
        result = err;
    }

    return result;
}

// sensors_init_bh1750:
// BH1750 센서를 초기화하고 핸들을 설정하는 함수
static esp_err_t sensors_init_bh1750(i2c_master_bus_handle_t *i2c_bus, i2c_master_dev_handle_t *bh1750)
{
    if (i2c_bus == NULL || bh1750 == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    i2c_master_bus_config_t bus_config = {
        .i2c_port = BH1750_I2C_PORT,
        .sda_io_num = BH1750_SDA_GPIO,
        .scl_io_num = BH1750_SCL_GPIO,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };

    esp_err_t err = i2c_new_master_bus(&bus_config, i2c_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "I2C bus init failed: %s", esp_err_to_name(err));
        return err;
    }

    uint16_t address = 0;
    err = sensors_probe_bh1750_address(*i2c_bus, &address);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "BH1750 not found on I2C SDA=%d SCL=%d: %s",
                 BH1750_SDA_GPIO, BH1750_SCL_GPIO, esp_err_to_name(err));
        return err;
    }

    i2c_device_config_t dev_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = address,
        .scl_speed_hz = BH1750_I2C_FREQ_HZ,
    };

    err = i2c_master_bus_add_device(*i2c_bus, &dev_config, bh1750);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "BH1750 add device failed: %s", esp_err_to_name(err));
        return err;
    }

    const uint8_t power_on_cmd = BH1750_CMD_POWER_ON;
    err = i2c_master_transmit(*bh1750, &power_on_cmd, sizeof(power_on_cmd), BH1750_I2C_TIMEOUT_MS);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "BH1750 power on failed: %s", esp_err_to_name(err));
        return err;
    }

    const uint8_t reset_cmd = BH1750_CMD_RESET;
    err = i2c_master_transmit(*bh1750, &reset_cmd, sizeof(reset_cmd), BH1750_I2C_TIMEOUT_MS);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "BH1750 reset failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "BH1750 init success: address 0x%02X, SDA=%d, SCL=%d",
             address, BH1750_SDA_GPIO, BH1750_SCL_GPIO);
    return ESP_OK;
}

// sensors_read_bh1750:
// BH1750 센서에서 조도값을 읽어오는 함수
static esp_err_t sensors_read_bh1750(int *light_level)
{
    if (light_level == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (s_bh1750 == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    const uint8_t measure_cmd = BH1750_CMD_ONE_TIME_HIGH_RES;
    esp_err_t err = i2c_master_transmit(s_bh1750, &measure_cmd, sizeof(measure_cmd), BH1750_I2C_TIMEOUT_MS);
    if (err != ESP_OK) {
        return err;
    }

    vTaskDelay(pdMS_TO_TICKS(BH1750_MEASUREMENT_DELAY_MS));

    uint8_t read_buf[2] = {0};
    err = i2c_master_receive(s_bh1750, read_buf, sizeof(read_buf), BH1750_I2C_TIMEOUT_MS);
    if (err != ESP_OK) {
        return err;
    }

    uint16_t raw = ((uint16_t)read_buf[0] << 8) | read_buf[1];
    float lux = raw / BH1750_LUX_SCALE;
    if (!isfinite(lux) || lux < 0.0f) {
        return ESP_ERR_INVALID_RESPONSE;
    }

    *light_level = (int)(lux + 0.5f);
    return ESP_OK;
}

// sensors_cleanup_handles:
// 1-Wire 버스와 DS18B20 센서 핸들을 정리하는 함수
static esp_err_t sensors_cleanup_handles(onewire_bus_handle_t *bus, ds18b20_device_handle_t sensors[], size_t *sensor_count)
{
    esp_err_t result = ESP_OK;
    size_t count = 0;

    // DS18B20 핸들 정리
    if (sensors != NULL) {
        count = (sensor_count != NULL) ? *sensor_count : DS18B20_SENSOR_COUNT;

        for (size_t i = 0; i < count; i++) {
            if (sensors[i] == NULL) {
                continue;
            }

            esp_err_t err = ds18b20_del_device(sensors[i]);
            if (err != ESP_OK) {
                ESP_LOGW(TAG, "failed to delete DS18B20[%u] handle: %s",
                         (unsigned int)i, esp_err_to_name(err));
                result = err;
            }
            sensors[i] = NULL;
        }
    }

    if (sensor_count != NULL) {
        *sensor_count = 0;
    }

    // 1-Wire 버스 핸들 정리
    if (bus != NULL && *bus != NULL) {
        esp_err_t err = onewire_bus_del(*bus);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "failed to delete 1-Wire bus handle: %s", esp_err_to_name(err));
            result = err;
        }
        *bus = NULL;
    }

    return result;
}

static esp_err_t sensors_cleanup_bh1750_handles(i2c_master_bus_handle_t *i2c_bus, i2c_master_dev_handle_t *bh1750)
{
    esp_err_t result = ESP_OK;

    if (bh1750 != NULL && *bh1750 != NULL) {
        esp_err_t err = i2c_master_bus_rm_device(*bh1750);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "failed to remove BH1750 device: %s", esp_err_to_name(err));
            result = err;
        }
        *bh1750 = NULL;
    }

    if (i2c_bus != NULL && *i2c_bus != NULL) {
        esp_err_t err = i2c_del_master_bus(*i2c_bus);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "failed to delete I2C bus: %s", esp_err_to_name(err));
            result = err;
        }
        *i2c_bus = NULL;
    }

    return result;
}

// sensors_init:
// DS18B20 센서를 찾아서 핸들을 설정하는 함수
esp_err_t sensors_init(void)
{
    onewire_bus_handle_t new_bus = NULL;
    ds18b20_device_handle_t new_ds18b20[DS18B20_SENSOR_COUNT] = {0};
    size_t new_ds18b20_count = 0;
    i2c_master_bus_handle_t new_i2c_bus = NULL;
    i2c_master_dev_handle_t new_bh1750 = NULL;
    onewire_device_iter_handle_t iter = NULL;
    onewire_device_t next_onewire_device;
    esp_err_t err = ESP_OK;

    // 이미 초기화된 핸들이 있으면 정리
    if (s_bus != NULL || s_ds18b20_count > 0 || s_i2c_bus != NULL || s_bh1750 != NULL) {
        ESP_LOGW(TAG, "reinitializing sensor driver");
        sensors_cleanup_handles(&s_bus, s_ds18b20, &s_ds18b20_count);
        sensors_cleanup_bh1750_handles(&s_i2c_bus, &s_bh1750);
    }

    // 1-Wire 버스 초기화
    onewire_bus_config_t bus_config = {
        .bus_gpio_num = DS18B20_GPIO,
        .flags = {
            .en_pull_up = true,
        }
    };

    // RMT 구성 설정
    onewire_bus_rmt_config_t rmt_config = {
        .max_rx_bytes = 10,
    };

    // RMT 기반 1-Wire 버스 생성
    err = onewire_new_bus_rmt(&bus_config, &rmt_config, &new_bus);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "1-Wire bus init failed: %s", esp_err_to_name(err));
        return err;
    }

    // 1-Wire 버스에 연결된 장치들을 순회하기 위한 iterator 생성
    err = onewire_new_device_iter(new_bus, &iter);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "device iterator init failed: %s", esp_err_to_name(err));
        goto cleanup;
    }

    // 1-Wire 버스에 연결된 장치들을 순회하면서 DS18B20 센서를 찾음
    while ((err = onewire_device_iter_get_next(iter, &next_onewire_device)) == ESP_OK) {
        ds18b20_config_t ds_cfg = {};
        ds18b20_device_handle_t sensor = NULL;
        
        // DS18B20 장치 핸들 생성 시도
        err = ds18b20_new_device_from_enumeration(&next_onewire_device, &ds_cfg, &sensor);
        if (err == ESP_OK) {
            new_ds18b20[new_ds18b20_count] = sensor;
            ESP_LOGI(TAG, "DS18B20[%u] found: 0x%016llX",
                     (unsigned int)new_ds18b20_count,
                     (unsigned long long)next_onewire_device.address);
            new_ds18b20_count++;

            if (new_ds18b20_count >= DS18B20_SENSOR_COUNT) {
                break;
            }

            continue;
        }

        // DS18B20이 아닌 다른 1-Wire 장치가 발견된 경우
        if (err != ESP_ERR_NOT_SUPPORTED) {
            ESP_LOGE(TAG, "failed to create DS18B20 device: %s", esp_err_to_name(err));
            goto cleanup;
        }

        // 지원되지 않는 1-Wire 장치 발견 시 경고 로그 출력
        ESP_LOGW(TAG, "skipping unsupported 1-Wire device: 0x%016llX",
                 (unsigned long long)next_onewire_device.address);
    }

    // 필요한 DS18B20 센서 개수보다 적게 발견된 경우 오류 처리
    if (new_ds18b20_count < DS18B20_SENSOR_COUNT) {
        ESP_LOGE(TAG, "expected %u DS18B20 devices, found %u",
                 (unsigned int)DS18B20_SENSOR_COUNT,
                 (unsigned int)new_ds18b20_count);
        err = ESP_ERR_NOT_FOUND;
        goto cleanup;
    }

    // DS18B20 센서 핸들 생성 중 다른 오류가 발생한 경우
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "device enumeration failed: %s", esp_err_to_name(err));
        goto cleanup;
    }

    // 성공적으로 DS18B20 센서 핸들이 생성된 경우, iterator 정리 및 전역 핸들 설정
    onewire_del_device_iter(iter);
    iter = NULL;

    err = sensors_init_bh1750(&new_i2c_bus, &new_bh1750);
    if (err != ESP_OK) {
        goto cleanup;
    }

    s_bus = new_bus;
    for (size_t i = 0; i < new_ds18b20_count; i++) {
        s_ds18b20[i] = new_ds18b20[i];
    }
    s_ds18b20_count = new_ds18b20_count;
    s_i2c_bus = new_i2c_bus;
    s_bh1750 = new_bh1750;

    ESP_LOGI(TAG, "sensor init success: %u DS18B20 sensor(s), BH1750 ready",
             (unsigned int)s_ds18b20_count);
    return ESP_OK;

cleanup:
    if (iter != NULL) {
        onewire_del_device_iter(iter);
    }
    sensors_cleanup_handles(&new_bus, new_ds18b20, &new_ds18b20_count);
    sensors_cleanup_bh1750_handles(&new_i2c_bus, &new_bh1750);
    return err;
}

// sensors_deinit:
// 센서 핸들을 넘겨서 삭제하는 함수
esp_err_t sensors_deinit(void)
{
    esp_err_t result = sensors_cleanup_handles(&s_bus, s_ds18b20, &s_ds18b20_count);
    esp_err_t err = sensors_cleanup_bh1750_handles(&s_i2c_bus, &s_bh1750);
    if (result == ESP_OK) {
        result = err;
    }
    return result;
}

// sensors_read_all:
// 모든 센서에서 데이터를 읽어와서 sensor_data_t 구조체에 저장하는 함수
esp_err_t sensors_read_all(sensor_data_t *out_data)
{
    if (out_data == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    sensors_reset_data(out_data);

    // 초기화 여부 확인
    if (s_bus == NULL || s_ds18b20_count < DS18B20_SENSOR_COUNT) {
        return ESP_ERR_INVALID_STATE;
    }

    // DS18B20 센서에서 온도 읽기
    esp_err_t err = ds18b20_trigger_temperature_conversion_for_all(s_bus);
    if (err != ESP_OK) {
        return err;
    }

    for (size_t i = 0; i < s_ds18b20_count; i++) {
        float temp_c = 0.0f;
        err = ds18b20_get_temperature(s_ds18b20[i], &temp_c);
        if (err != ESP_OK) {
            return err;
        }

        // 센서 데이터 이상치 검사: 온도가 유한한 숫자인지, DS18B20의 허용 범위 내에 있는지 확인 (전처리 단계)
        if (!sensors_is_valid_temperature(temp_c)) {
            ESP_LOGW(TAG, "discarding implausible DS18B20[%u] reading: %.2f C",
                     (unsigned int)i, temp_c);
            return ESP_ERR_INVALID_RESPONSE;
        }

        sensors_store_ds18b20_reading(out_data, i, temp_c);
    }

    int light_level = 0;
    err = sensors_read_bh1750(&light_level);
    if (err != ESP_OK) {
        return err;
    }

    out_data->light_level = light_level;
    out_data->light_ok = true;

    return ESP_OK;
}
