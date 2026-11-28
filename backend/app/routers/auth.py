import logging
import secrets
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import settings
from app.deps import DB, IncompleteUser, RedisDep, needs_email_check
from app.models import AuthProvider, User
from app.ratelimit import enforce_hourly_limit
from app.schemas import GoogleIn, LoginIn, RefreshIn, RegisterIn, TokensOut
from app.security import (
    consume_refresh_token,
    create_access_token,
    create_refresh_token,
    hash_password,
    revoke_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger(__name__)


async def _tokens(redis, user: User) -> TokensOut:
    return TokensOut(
        access_token=create_access_token(user.id),
        refresh_token=await create_refresh_token(redis, user.id),
        needs_display_name=not user.display_name,
        needs_onboarding=not (user.onboarded or user.onboarding_tags),
        needs_email_check=needs_email_check(user),
    )


async def display_name_taken(db, name: str) -> bool:
    return bool(await db.scalar(select(User.id).where(func.lower(User.display_name) == name.lower())))


CONFIRM_TTL = 2 * 86400  # the link works for 2 days


async def _send_verification(redis, user: User) -> None:
    """Emails a one-time confirmation link through Brevo. Without Brevo (local development) the link is
    logged instead, and confirming isn't required."""
    token = secrets.token_urlsafe(32)
    await redis.set(f"verify:{token}", str(user.id), ex=CONFIRM_TTL)
    link = f"{settings.web_url.rstrip('/')}/verify?token={token}"
    if not settings.brevo_api_key or not user.email:
        log.warning("Email confirmation link for %s: %s", user.email, link)
        return
    from app.services import email

    subject, page, text = email.confirmation(link)
    if not await email.send(user.email, subject, page, text):
        log.warning("Couldn't send the confirmation email for user %s", user.id)


@router.post("/register", response_model=TokensOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, db: DB, redis: RedisDep, background: BackgroundTasks):
    email = body.email.lower()
    from app.services.email_checks import problem_with

    if problem := await problem_with(email):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists")
    if await display_name_taken(db, body.display_name):
        raise HTTPException(status.HTTP_409_CONFLICT, "That display name is taken")
    user = User(
        email=email,
        password_hash=await run_in_threadpool(hash_password, body.password),
        display_name=body.display_name,
        auth_provider=AuthProvider.email,
    )
    db.add(user)
    await db.commit()
    # Sent after the response, so signing up doesn't wait on the email service.
    background.add_task(_send_verification, redis, user)
    return await _tokens(redis, user)


@router.post("/login", response_model=TokensOut)
async def login(body: LoginIn, db: DB, redis: RedisDep):
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    ok = user and await run_in_threadpool(verify_password, body.password, user.password_hash)
    if not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return await _tokens(redis, user)


@router.post("/google", response_model=TokensOut)
async def google(body: GoogleIn, db: DB, redis: RedisDep):
    if not settings.google_client_ids:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google sign-in is not configured")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        claims = await run_in_threadpool(
            id_token.verify_oauth2_token, body.id_token, google_requests.Request(), None
        )
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google token") from None
    if claims.get("aud") not in settings.google_client_ids:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google token is for a different app")

    user = await db.scalar(
        select(User).where(User.auth_provider == AuthProvider.google, User.social_provider_id == claims["sub"])
    )
    if not user:
        email = (claims.get("email") or "").lower() or None
        if email and await db.scalar(select(User.id).where(User.email == email)):
            raise HTTPException(status.HTTP_409_CONFLICT, "That email already has a password account")
        # Spec 6.2: never copy the Google profile name into display_name.
        user = User(
            email=email,
            auth_provider=AuthProvider.google,
            social_provider_id=claims["sub"],
            email_verified=bool(claims.get("email_verified")),
        )
        db.add(user)
        await db.commit()
    return await _tokens(redis, user)


@router.post("/refresh", response_model=TokensOut)
async def refresh(body: RefreshIn, db: DB, redis: RedisDep):
    user_id = await consume_refresh_token(redis, body.refresh_token)
    user = await db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please sign in again")
    return await _tokens(redis, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshIn, redis: RedisDep):
    await revoke_refresh_token(redis, body.refresh_token)


class VerifyIn(BaseModel):
    token: str


@router.post("/resend-confirmation", status_code=status.HTTP_204_NO_CONTENT)
async def resend_confirmation(user: IncompleteUser, redis: RedisDep):
    """Sends a fresh confirmation link. Earlier links keep working until they expire."""
    if user.email_verified or not user.email:
        return
    await enforce_hourly_limit(redis, "confirm_email", user.id, settings.confirmation_emails_per_hour)
    await _send_verification(redis, user)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(body: VerifyIn, db: DB, redis: RedisDep):
    user_id = await redis.getdel(f"verify:{body.token}")
    user = await db.get(User, uuid.UUID(user_id)) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That link is invalid or expired")
    user.email_verified = True
    await db.commit()
