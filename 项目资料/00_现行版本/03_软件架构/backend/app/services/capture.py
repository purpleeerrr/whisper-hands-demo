"""Application service for the private Process Inbox capture step."""

from datetime import UTC, datetime
from uuid import uuid4

from ..domain.models import DeviceEvent, DeviceEventType, InboxItem, InboxStatus
from ..ports import AudioPort, CameraPort, FeedbackPort, Repository


class CaptureService:
    def __init__(
        self,
        repository: Repository,
        camera: CameraPort,
        audio: AudioPort,
        feedback: FeedbackPort,
    ) -> None:
        self.repository = repository
        self.camera = camera
        self.audio = audio
        self.feedback = feedback

    def accept(self, event: DeviceEvent) -> InboxItem | None:
        """Persist first, acknowledge quickly, then capture optional media.

        Returning None means the device retried an event already accepted.
        """
        if self.repository.has_event(event.event_id):
            return None

        now = datetime.now(UTC)
        self.repository.append_event(event, received_at=now)

        if event.type is not DeviceEventType.MARK_PRESSED:
            return None

        template_id = event.payload.get("template_id")
        if not template_id:
            self.feedback.error()
            return None

        item = InboxItem(
            id=f"inbox_{uuid4().hex}",
            source_event_id=event.event_id,
            captured_at=event.occurred_at,
            template_id=template_id,
            project_id=event.payload.get("project_id"),
        )
        self.repository.create_inbox_item(item)
        self.feedback.accepted()

        item.status = InboxStatus.CAPTURED
        self.repository.update_inbox_item(item)

        failures = 0
        for capture in (self.camera.capture, self.audio.record):
            try:
                capture(item.id)
            except Exception:
                failures += 1

        item.status = InboxStatus.PARTIAL if failures else InboxStatus.READY_TO_SHAPE
        self.repository.update_inbox_item(item)
        if failures:
            self.feedback.partial()
        return item
