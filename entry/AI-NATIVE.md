# Native AI transport

`AiBridge.ets` uses the existing Asset Store credential queue and alias `wenzhou.ai.token` for one complete `{format, endpoint, key}` credential. Only status metadata is returned to the WebView. Git authentication generations do not cancel AI credential writes.

[Asset Store limits `SECRET` to 1024 bytes](https://raw.githubusercontent.com/openharmony/docs/master/zh-cn/application-dev/security/AssetStoreKit/asset-js-add.md). Like Git tokens, the AI credential is stored directly in `SECRET`, protected by Asset Store, with `DEVICE_UNLOCKED` accessibility, overwrite on conflict and default no-sync behavior. `NativeBridge.ets` encodes `format + "\n" + endpoint + "\n" + key` as UTF-8 and checks that it is at most 1024 bytes before writing. There is no additional application crypto layer or use of label fields.

All three native platforms accept only `openai`, `anthropic`, `gemini` or `azure` as the format. Endpoints are limited to 400 characters and keys to 512 characters; both accept only printable ASCII (`[\x21-\x7e]`), with an empty key allowed. Internationalized hosts must already be punycode. Existing endpoint checks still require HTTP(S), reject user info, query strings and fragments, and restrict HTTP to permitted local/private hosts (Android further restricts HTTP to `localhost`, `127.0.0.1` and `10.0.2.2`). These limits bound the packed record to `9 + 1 + 400 + 1 + 512 = 923` bytes, including both newline separators. Android and Windows retain their existing credential storage.

Local HTTP uses native `rcp`, independently of ArkWeb's mixed-content settings. `resources/base/profile/network_config.json` explicitly permits cleartext for Remote Communication Kit; the native endpoint validator restricts it to localhost, loopback, private IPv4 addresses and `.local` names. Public endpoints require HTTPS. System certificate validation stays enabled.

The [RCP preparation guide](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/remote-communication-preparations) describes HTTP policy support from API 23. The [network security configuration reference](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/network/http-request.md#明文http访问权限配置说明) describes the profile and component switches. The installed API 24 SDK declares error `1007900201` for blocked cleartext; it is reported with a Chinese message suggesting HTTPS. API 12–22 use the same endpoint checks; the newer profile policy is only effective on supported OS versions.

Each network request owns a separate `rcp.Session`. Cancel marks that request and calls `Session.cancel()`; a `finally` closes the session and releases the request ID. A 120-second deadline also cancels the session. `onDataReceive` accumulates at most 4 MB and cancels immediately on overflow, rather than buffering RCP's default response limit. Bytes are joined before UTF-8 decoding.

Verified here: API 24 ArkTS compilation, debug HAP packaging, and SDK fixture tests covering direct SECRET storage, maximum record size, ASCII/length rejection, restart, cancellation isolation and response limits. Actual runtime behavior still requires a HarmonyOS device/emulator smoke test; compilation and fixtures do not prove it. Use a local mock service and an empty key, with no manuscript needed:

- Connect over local HTTP.
- Save the credential, restart the app and confirm persistence.
- Cancel before response headers and during a slow body, with a second request left running.
- Reject an over-limit chunked response.
