"""Framework-free models for the template-aware Whisper Hands Demo."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any


class DeviceEventType(StrEnum):
    MARK_PRESSED = "MARK_PRESSED"
    SESSION_STARTED = "SESSION_STARTED"
    SESSION_ENDED = "SESSION_ENDED"
    DEVICE_HEARTBEAT = "DEVICE_HEARTBEAT"


class InboxStatus(StrEnum):
    CAPTURED = "captured"
    PARTIAL = "partial"
    READY_TO_SHAPE = "ready_to_shape"
    CANDIDATE_READY = "candidate_ready"
    CONFIRMED = "confirmed"
    DISCARDED = "discarded"


class CandidateStatus(StrEnum):
    DRAFT = "draft"
    NEEDS_INPUT = "needs_input"
    ACCEPTED = "accepted"
    DISCARDED = "discarded"


class RecallAction(StrEnum):
    OPEN = "open"
    DISMISS = "dismiss"
    SNOOZE = "snooze"
    DISABLE = "disable"


@dataclass(frozen=True)
class DeviceEvent:
    event_id: str
    device_id: str
    type: DeviceEventType
    occurred_at: datetime
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Template:
    id: str
    name: str
    scope: str
    definition: dict[str, Any]
    parent_template_id: str | None = None


@dataclass
class InboxItem:
    id: str
    source_event_id: str
    template_id: str
    captured_at: datetime
    status: InboxStatus = InboxStatus.CAPTURED
    project_id: str | None = None
    transcript_raw: str | None = None
    assets: list[dict[str, str]] = field(default_factory=list)


@dataclass
class CandidateRecord:
    id: str
    inbox_item_id: str
    template_id: str
    values: dict[str, Any]
    evidence: list[str] = field(default_factory=list)
    status: CandidateStatus = CandidateStatus.DRAFT


@dataclass(frozen=True)
class ContextChanged:
    occurred_at: datetime
    template_id: str
    project_id: str | None = None
    field_key: str | None = None
    field_value: str | None = None


@dataclass(frozen=True)
class RecallCandidate:
    confirmed_record_id: str
    template_id: str
    trigger_reason: str
    summary: str
