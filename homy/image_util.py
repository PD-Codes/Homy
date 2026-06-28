"""Image validation and resizing for uploads."""

from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_FORMATS = {'JPEG', 'PNG', 'WEBP', 'GIF'}


def verify_image_stream(stream) -> tuple[bool, str]:
    """Ensure file is a real image (not only extension/MIME)."""
    try:
        from PIL import Image
    except ImportError:
        logger.warning('Pillow not installed — skipping deep image verification')
        return True, ''

    try:
        stream.seek(0)
        with Image.open(stream) as im:
            im.verify()
        stream.seek(0)
        with Image.open(stream) as im:
            if im.format not in ALLOWED_IMAGE_FORMATS:
                return False, f'Unsupported image format ({im.format})'
            im.load()
        stream.seek(0)
        return True, ''
    except Exception as exc:
        stream.seek(0)
        return False, f'Invalid image file ({exc})'


def optimize_image_file(path: str, *, max_side: int = 512, quality: int = 88) -> None:
    """Resize/compress image in place (for avatars/icons)."""
    try:
        from PIL import Image
    except ImportError:
        return

    try:
        with Image.open(path) as im:
            im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
            im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            ext = path.rsplit('.', 1)[-1].lower()
            if ext in ('jpg', 'jpeg'):
                im = im.convert('RGB')
                im.save(path, format='JPEG', quality=quality, optimize=True)
            elif ext == 'webp':
                im.save(path, format='WEBP', quality=quality)
            else:
                im.save(path, format='PNG', optimize=True)
    except Exception as exc:
        logger.warning('Image optimize failed for %s: %s', path, exc)
