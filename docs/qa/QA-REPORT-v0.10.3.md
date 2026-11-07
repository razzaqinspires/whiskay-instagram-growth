# QA Report — WHISKAY v0.10.3

Scope: Native Flow envelope compatibility, Instagram dashboard actions, single-select service catalog and service detail command.

Results in this package build:
- 98/98 Node tests passed.
- 65 ESM files passed syntax validation.
- Native Flow tests verify `biz` attributes, `quality_control/decision_source`, private-chat `bot biz_bot=1` node and its omission in group chats.
- Single-select service rows retain the namespaced `.igservice <service-id>` command.
- Response parsing and text fallback tests passed.

Automated tests do not prove server acceptance or rendering on WhatsApp Android/iOS/Web. Live device confirmation remains required.
