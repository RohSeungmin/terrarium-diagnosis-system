/*
 * comms.c
 *
 * 역할:
 * - 시스템 상태와 센서 데이터를 외부로 전송하는 모듈
 * - MQTT 토픽, QoS, 메시지 유형(summary/event/alert/fault)을 결정함
 * - 상태 메시지(summary/event/alert/fault)와 노드 생존 확인용 heartbeat를 MQTT로 발행함
 *
 */

#include "comms.h"
#include "comms_payload.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "mqtt_client.h"
#include "mqtt5_client.h"

static const char *TAG = "comms";

// MQTT topic과 JSON payload를 만들 때 사용하는 고정 버퍼 크기
#define COMMS_TOPIC_BUFFER_SIZE 160U
#define COMMS_PAYLOAD_BUFFER_SIZE 3072U
#define COMMS_HEARTBEAT_QOS 0
#define COMMS_HEARTBEAT_RETAIN false
#define COMMS_MILLISECONDS_PER_SECOND 1000U

// Default expiry values. Applied to MQTT v5 properties and JSON metadata.
#define COMMS_SUMMARY_EXPIRY_MS 30000U // 30초
#define COMMS_EVENT_EXPIRY_MS 300000U // 5분
#define COMMS_ALERT_EXPIRY_MS 1800000U // 30분
#define COMMS_FAULT_EXPIRY_MS 600000U // 10분

// comms_string_is_empty:
// 문자열 설정값이 NULL 또는 빈 문자열인지 확인하는 함수
static bool comms_string_is_empty(const char *value)
{
    return value == NULL || value[0] == '\0';
}

// comms_message_kind_from_state_logic:
// state_logic의 메시지 타입을 comms 내부 메시지 종류로 변환하는 함수
// heartbeat는 별도 API에서 발행하므로 상태 메시지 경로에서는 false를 반환함
static bool comms_message_kind_from_state_logic(state_logic_message_type_t message_type,
                                                comms_message_kind_t *out_kind)
{
    if (out_kind == NULL) {
        return false;
    }

    switch (message_type) {
        case MESSAGE_SUMMARY:
            *out_kind = COMMS_MESSAGE_SUMMARY;
            return true;
        case MESSAGE_EVENT:
            *out_kind = COMMS_MESSAGE_EVENT;
            return true;
        case MESSAGE_ALERT:
            *out_kind = COMMS_MESSAGE_ALERT;
            return true;
        case MESSAGE_FAULT:
            *out_kind = COMMS_MESSAGE_FAULT;
            return true;
        case MESSAGE_HEARTBEAT:
        default:
            return false;
    }
}

// comms_get_policy:
// 메시지 종류에 맞는 topic suffix, QoS, retain, expiry 정책을 가져오는 함수
static const comms_message_policy_t *comms_get_policy(const comms_ctx_t *ctx,
                                                      comms_message_kind_t kind)
{
    switch (kind) {
        case COMMS_MESSAGE_SUMMARY:
            return &ctx->config.summary_policy;
        case COMMS_MESSAGE_EVENT:
            return &ctx->config.event_policy;
        case COMMS_MESSAGE_ALERT:
            return &ctx->config.alert_policy;
        case COMMS_MESSAGE_FAULT:
            return &ctx->config.fault_policy;
        default:
            return NULL;
    }
}

// comms_policy_is_valid:
// 메시지별 MQTT 발행 정책이 사용할 수 있는 범위인지 확인하는 함수
static bool comms_policy_is_valid(const comms_message_policy_t *policy)
{
    return policy != NULL &&
           !comms_string_is_empty(policy->topic_suffix) &&
           policy->qos >= 0 &&
           policy->qos <= 2;
}

// comms_config_is_valid:
// MQTT 연결 및 topic 구성에 필요한 comms 설정값을 검증하는 함수
static bool comms_config_is_valid(const comms_config_t *config)
{
    return config != NULL &&
           !comms_string_is_empty(config->broker_uri) &&
           !comms_string_is_empty(config->node_id) &&
           !comms_string_is_empty(config->topic_prefix) &&
           !comms_string_is_empty(config->heartbeat_topic_suffix) &&
           config->heartbeat_publish_interval_ms > 0U &&
           comms_policy_is_valid(&config->summary_policy) &&
           comms_policy_is_valid(&config->event_policy) &&
           comms_policy_is_valid(&config->alert_policy) &&
           comms_policy_is_valid(&config->fault_policy);
}

// comms_build_topic_from_suffix:
// topic_prefix/node_id/message_suffix 형식의 MQTT topic 문자열을 생성하는 함수
static esp_err_t comms_build_topic_from_suffix(const comms_ctx_t *ctx,
                                               const char *topic_suffix,
                                               char *topic,
                                               size_t topic_size)
{
    if (ctx == NULL || comms_string_is_empty(topic_suffix) || topic == NULL || topic_size == 0U) {
        return ESP_ERR_INVALID_ARG;
    }

    int written = snprintf(topic,
                           topic_size,
                           "%s/%s/%s",
                           ctx->config.topic_prefix,
                           ctx->config.node_id,
                           topic_suffix);
    if (written < 0 || (size_t)written >= topic_size) {
        return ESP_ERR_NO_MEM;
    }

    return ESP_OK;
}

// comms_build_topic:
// 메시지 발행 정책의 suffix를 사용해서 MQTT topic 문자열을 생성하는 함수
static esp_err_t comms_build_topic(const comms_ctx_t *ctx,
                                   const comms_message_policy_t *policy,
                                   char *topic,
                                   size_t topic_size)
{
    if (policy == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    return comms_build_topic_from_suffix(ctx, policy->topic_suffix, topic, topic_size);
}

static uint32_t comms_expiry_ms_to_seconds(uint32_t expiry_ms)
{
    if (expiry_ms == 0U) {
        return 0U;
    }

    return (expiry_ms / COMMS_MILLISECONDS_PER_SECOND) +
           ((expiry_ms % COMMS_MILLISECONDS_PER_SECOND) == 0U ? 0U : 1U);
}

static uint32_t comms_heartbeat_expiry_ms(const comms_ctx_t *ctx)
{
    if (ctx == NULL) {
        return 0U;
    }

    if (ctx->config.heartbeat_publish_interval_ms > UINT32_MAX / 2U) {
        return UINT32_MAX;
    }

    return ctx->config.heartbeat_publish_interval_ms * 2U;
}

static esp_err_t comms_publish_json(esp_mqtt_client_handle_t client,
                                    const char *topic,
                                    const char *payload,
                                    int qos,
                                    int retain,
                                    uint32_t expiry_ms,
                                    int *out_msg_id)
{
    if (client == NULL || topic == NULL || payload == NULL || out_msg_id == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    const esp_mqtt5_publish_property_config_t property = {
        .payload_format_indicator = true,
        .message_expiry_interval = comms_expiry_ms_to_seconds(expiry_ms),
        .content_type = "application/json",
    };

    esp_err_t err = esp_mqtt5_client_set_publish_property((esp_mqtt5_client_handle_t)client,
                                                          &property);
    if (err != ESP_OK) {
        return err;
    }

    int msg_id = esp_mqtt_client_publish(client,
                                         topic,
                                         payload,
                                         0,
                                         qos,
                                         retain);
    if (msg_id < 0) {
        return ESP_FAIL;
    }

    *out_msg_id = msg_id;
    return ESP_OK;
}

// comms_mqtt_event_handler:
// ESP-MQTT 이벤트를 받아 연결 상태를 comms_ctx_t에 반영하는 콜백 함수
static void comms_mqtt_event_handler(void *handler_args,
                                     esp_event_base_t base,
                                     int32_t event_id,
                                     void *event_data)
{
    (void)base;
    (void)event_data;

    comms_ctx_t *ctx = (comms_ctx_t *)handler_args;
    if (ctx == NULL) {
        return;
    }

    switch ((esp_mqtt_event_id_t)event_id) {
        case MQTT_EVENT_CONNECTED:
            ctx->connected = true;
            ESP_LOGI(TAG, "MQTT connected");
            break;
        case MQTT_EVENT_DISCONNECTED:
            ctx->connected = false;
            ESP_LOGW(TAG, "MQTT disconnected");
            break;
        case MQTT_EVENT_ERROR:
            ctx->connected = false;
            ESP_LOGW(TAG, "MQTT transport error");
            break;
        default:
            break;
    }
}

// 공개 API 구현

// comms_get_default_config:
// 제안서 기준 MQTT 적응형 발행 정책을 기본 설정값으로 저장하는 함수
void comms_get_default_config(comms_config_t *out_config)
{
    if (out_config == NULL) {
        return;
    }

    memset(out_config, 0, sizeof(*out_config));

    out_config->broker_uri = COMMS_DEFAULT_BROKER_URI;
    out_config->node_id = COMMS_DEFAULT_NODE_ID;
    out_config->topic_prefix = COMMS_DEFAULT_TOPIC_PREFIX;
    out_config->heartbeat_topic_suffix = COMMS_DEFAULT_HEARTBEAT_TOPIC_SUFFIX;
    out_config->heartbeat_publish_interval_ms = COMMS_DEFAULT_HEARTBEAT_PUBLISH_INTERVAL_MS;

    out_config->summary_policy = (comms_message_policy_t){
        .topic_suffix = "summary",
        .qos = 0,
        .retain = false,
        .expiry_ms = COMMS_SUMMARY_EXPIRY_MS,
    };
    out_config->event_policy = (comms_message_policy_t){
        .topic_suffix = "event",
        .qos = 1,
        .retain = false,
        .expiry_ms = COMMS_EVENT_EXPIRY_MS,
    };
    out_config->alert_policy = (comms_message_policy_t){
        .topic_suffix = "alert",
        .qos = 1,
        .retain = false,
        .expiry_ms = COMMS_ALERT_EXPIRY_MS,
    };
    out_config->fault_policy = (comms_message_policy_t){
        .topic_suffix = "fault",
        .qos = 1,
        .retain = false,
        .expiry_ms = COMMS_FAULT_EXPIRY_MS,
    };
}

// comms_init:
// MQTT 클라이언트를 초기화하고 broker 연결을 시작하는 함수
esp_err_t comms_init(comms_ctx_t *ctx, const comms_config_t *config)
{
    comms_config_t effective_config;

    if (ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (config == NULL) {
        comms_get_default_config(&effective_config);
    } else {
        effective_config = *config;
    }

    if (!comms_config_is_valid(&effective_config)) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(ctx, 0, sizeof(*ctx));
    ctx->config = effective_config;

    esp_err_t err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "esp_netif_init failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "esp_event_loop_create_default failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG,
             "MQTT connecting: broker=%s, topic_prefix=%s, node_id=%s",
             ctx->config.broker_uri,
             ctx->config.topic_prefix,
             ctx->config.node_id);

    const esp_mqtt_client_config_t mqtt_cfg = {
        .broker.address.uri = ctx->config.broker_uri,
        .session.protocol_ver = MQTT_PROTOCOL_V_5,
    };

    esp_mqtt_client_handle_t client = esp_mqtt_client_init(&mqtt_cfg);
    if (client == NULL) {
        ESP_LOGW(TAG, "failed to initialize MQTT client");
        return ESP_FAIL;
    }

    err = esp_mqtt_client_register_event(client, ESP_EVENT_ANY_ID, comms_mqtt_event_handler, ctx);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "failed to register MQTT event handler: %s", esp_err_to_name(err));
        esp_mqtt_client_destroy(client);
        return err;
    }

    err = esp_mqtt_client_start(client);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "failed to start MQTT client: %s", esp_err_to_name(err));
        esp_mqtt_client_destroy(client);
        return err;
    }

    ctx->mqtt_client = client;
    ctx->mqtt_started = true;

    return ESP_OK;
}

// comms_publish_heartbeat_if_needed:
// 설정된 주기가 지났을 때 노드 생존 확인용 heartbeat 메시지를 발행하는 함수
esp_err_t comms_publish_heartbeat_if_needed(comms_ctx_t *ctx,
                                            state_logic_state_t current_state,
                                            uint32_t now_ms)
{
    if (ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!comms_config_is_valid(&ctx->config)) {
        return ESP_ERR_INVALID_STATE;
    }

    if (ctx->last_heartbeat_publish_ms != 0U &&
        now_ms - ctx->last_heartbeat_publish_ms < ctx->config.heartbeat_publish_interval_ms) {
        return ESP_OK;
    }

    esp_mqtt_client_handle_t client = (esp_mqtt_client_handle_t)ctx->mqtt_client;
    if (client == NULL || !ctx->mqtt_started || !ctx->connected) {
        ESP_LOGW(TAG, "skip MQTT heartbeat: client is not connected");
        return ESP_ERR_INVALID_STATE;
    }

    char topic[COMMS_TOPIC_BUFFER_SIZE];
    esp_err_t err = comms_build_topic_from_suffix(ctx,
                                                  ctx->config.heartbeat_topic_suffix,
                                                  topic,
                                                  sizeof(topic));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "failed to build MQTT heartbeat topic: %s", esp_err_to_name(err));
        return err;
    }

    char *payload = (char *)malloc(COMMS_PAYLOAD_BUFFER_SIZE);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = comms_build_heartbeat_payload(payload,
                                        COMMS_PAYLOAD_BUFFER_SIZE,
                                        ctx,
                                        current_state,
                                        ctx->connected,
                                        now_ms);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "failed to build MQTT heartbeat payload: %s", esp_err_to_name(err));
        free(payload);
        return err;
    }

    int msg_id = 0;
    err = comms_publish_json(client,
                             topic,
                             payload,
                             COMMS_HEARTBEAT_QOS,
                             COMMS_HEARTBEAT_RETAIN ? 1 : 0,
                             comms_heartbeat_expiry_ms(ctx),
                             &msg_id);
    free(payload);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "MQTT heartbeat publish failed: topic=%s err=%s",
                 topic,
                 esp_err_to_name(err));
        return err;
    }

    ctx->last_heartbeat_publish_ms = now_ms;
    ESP_LOGI(TAG, "MQTT heartbeat queued: topic=%s msg_id=%d", topic, msg_id);

    return ESP_OK;
}

// comms_deinit:
// MQTT 클라이언트를 정지하고 comms 컨텍스트의 연결 상태를 초기화하는 함수
esp_err_t comms_deinit(comms_ctx_t *ctx)
{
    if (ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    esp_mqtt_client_handle_t client = (esp_mqtt_client_handle_t)ctx->mqtt_client;
    if (client != NULL) {
        if (ctx->mqtt_started) {
            esp_err_t stop_err = esp_mqtt_client_stop(client);
            if (stop_err != ESP_OK) {
                ESP_LOGW(TAG, "failed to stop MQTT client: %s", esp_err_to_name(stop_err));
            }
        }

        esp_err_t destroy_err = esp_mqtt_client_destroy(client);
        if (destroy_err != ESP_OK) {
            ESP_LOGW(TAG, "failed to destroy MQTT client: %s", esp_err_to_name(destroy_err));
            return destroy_err;
        }
    }

    ctx->mqtt_client = NULL;
    ctx->mqtt_started = false;
    ctx->connected = false;

    return ESP_OK;
}

// comms_publish_if_needed:
// state_logic_result가 발행을 요청한 경우에만 MQTT 메시지를 생성하고 발행하는 함수
// MQTT 실패는 에러로 반환하지만, 호출자는 로컬 진단 루프를 계속 유지해야 함
esp_err_t comms_publish_if_needed(comms_ctx_t *ctx,
                                  const preprocess_result_t *preprocess_result,
                                  const diagnosis_result_t *diagnosis_result,
                                  const state_logic_result_t *state_logic_result,
                                  uint32_t now_ms)
{
    if (ctx == NULL || preprocess_result == NULL || diagnosis_result == NULL ||
        state_logic_result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!state_logic_result->should_send_message) {
        return ESP_OK;
    }

    comms_message_kind_t kind;
    if (!comms_message_kind_from_state_logic(state_logic_result->message_type, &kind)) {
        return ESP_OK;
    }

    const comms_message_policy_t *policy = comms_get_policy(ctx, kind);
    if (!comms_policy_is_valid(policy)) {
        return ESP_ERR_INVALID_STATE;
    }

    esp_mqtt_client_handle_t client = (esp_mqtt_client_handle_t)ctx->mqtt_client;
    if (client == NULL || !ctx->mqtt_started || !ctx->connected) {
        ESP_LOGW(TAG, "skip MQTT publish: client is not connected");
        return ESP_ERR_INVALID_STATE;
    }

    char topic[COMMS_TOPIC_BUFFER_SIZE];
    esp_err_t err = comms_build_topic(ctx, policy, topic, sizeof(topic));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "failed to build MQTT topic: %s", esp_err_to_name(err));
        return err;
    }

    char *payload = (char *)malloc(COMMS_PAYLOAD_BUFFER_SIZE);
    if (payload == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = comms_build_payload(payload,
                              COMMS_PAYLOAD_BUFFER_SIZE,
                              ctx,
                              policy,
                              kind,
                              preprocess_result,
                              diagnosis_result,
                              state_logic_result,
                              now_ms);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "failed to build MQTT payload: %s", esp_err_to_name(err));
        free(payload);
        return err;
    }

    int msg_id = 0;
    err = comms_publish_json(client,
                             topic,
                             payload,
                             policy->qos,
                             policy->retain ? 1 : 0,
                             policy->expiry_ms,
                             &msg_id);
    free(payload);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "MQTT publish failed: topic=%s err=%s", topic, esp_err_to_name(err));
        return err;
    }

    ctx->last_publish_ms[kind] = now_ms;
    ESP_LOGI(TAG, "MQTT publish queued: topic=%s msg_id=%d", topic, msg_id);

    return ESP_OK;
}
