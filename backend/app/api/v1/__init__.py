from fastapi import APIRouter
from app.api.v1 import admin_routes, ai_routes, auth_routes, projects_routes, test_routes

api_router = APIRouter()
api_router.include_router(auth_routes.router)
api_router.include_router(admin_routes.router)
api_router.include_router(projects_routes.router)
api_router.include_router(test_routes.router)
api_router.include_router(ai_routes.router)
