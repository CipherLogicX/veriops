"""Role definitions, hierarchy, and RBAC helpers."""
from dataclasses import dataclass
from fastapi import HTTPException, status


@dataclass(frozen=True)
class RoleDef:
    key: str
    name: str
    is_admin: bool
    level: int  # higher = more privilege


SYSTEM_ROLES: list[RoleDef] = [
    RoleDef("SUPER_ADMIN",     "Super Admin",     True,  100),
    RoleDef("PROJECT_MANAGER", "Project Manager", False,  40),
    RoleDef("QA_LEAD",         "QA Lead",         False,  30),
    RoleDef("TESTER",          "Tester",          False,  20),
    RoleDef("VIEWER",          "Viewer",          False,  10),
]

ROLE_BY_KEY: dict[str, RoleDef] = {r.key: r for r in SYSTEM_ROLES}

# Full platform admins (user mgmt, project mgmt)
FULL_ADMIN_ROLE_KEYS = {"SUPER_ADMIN"}
# Integration management
INTEGRATION_ADMIN_ROLE_KEYS = {"SUPER_ADMIN"}

# Allowed project-scoped roles (cannot assign global roles via project membership)
VALID_PROJECT_ROLES = {"PROJECT_MANAGER", "QA_LEAD", "TESTER", "VIEWER"}

# Role sets for project-level actions
TC_WRITE_ROLES      = {"PROJECT_MANAGER", "QA_LEAD"}
TC_EXECUTE_ROLES    = TC_WRITE_ROLES | {"TESTER"}
DEFECT_WRITE_ROLES  = TC_EXECUTE_ROLES
PROJECT_MANAGE_ROLES = {"PROJECT_MANAGER"}


def is_admin_role(role_keys: set[str]) -> bool:
    return bool(role_keys & FULL_ADMIN_ROLE_KEYS)


def is_integration_admin(role_keys: set[str]) -> bool:
    return bool(role_keys & INTEGRATION_ADMIN_ROLE_KEYS)


def caller_level(role_keys: set[str]) -> int:
    """Return the highest privilege level among the caller's roles."""
    return max((ROLE_BY_KEY[k].level for k in role_keys if k in ROLE_BY_KEY), default=0)


def _require(condition: bool, detail: str = "Permission denied.") -> None:
    if not condition:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def enforce_role_assignment(actor_roles: set[str], target_role_keys: list[str]) -> None:
    """Enforce that actor cannot assign a role higher than their own level.
    Only SUPER_ADMIN may assign roles."""
    actor_lvl = caller_level(actor_roles)
    # Only SUPER_ADMIN can manage roles
    _require(
        bool(actor_roles & FULL_ADMIN_ROLE_KEYS),
        "Only administrators can assign roles."
    )
    for key in target_role_keys:
        if key not in ROLE_BY_KEY:
            raise HTTPException(status_code=400, detail=f"Unknown role: {key}")
        target_role = ROLE_BY_KEY[key]
        if key == "SUPER_ADMIN" and "SUPER_ADMIN" not in actor_roles:
            _require(False, "Only SUPER_ADMIN can assign the SUPER_ADMIN role.")
        if target_role.level > actor_lvl:
            _require(False, f"Cannot assign role '{key}': it exceeds your privilege level.")
