#!/usr/bin/env python3
"""
install.py - Unified installer for Jacques hooks

Installs hooks for various AI tools:
- Claude Code CLI: ~/.claude/settings.json
- Cursor Native: .cursor/hooks.json (per-project)

Usage:
  python3 install.py --source claude_code  # Install Claude Code hooks
  python3 install.py --source cursor       # Install Cursor hooks
  python3 install.py --all                 # Install all sources
  python3 install.py --list                # Show available sources
  python3 install.py --status              # Show installation status
"""
import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


# ============================================================================
# Configuration
# ============================================================================

JACQUES_HOME = Path.home() / '.jacques'
HOOKS_DIR = JACQUES_HOME / 'hooks'
SCRIPT_DIR = Path(__file__).parent

SOURCES = {
    'claude_code': {
        'name': 'Claude Code CLI',
        'description': 'Claude Code CLI (standalone or in Cursor terminal)',
        'config_path': Path.home() / '.claude' / 'settings.json',
        'hooks_subdir': 'claude-code',
        'hooks': {
            'SessionStart': 'register-session.py',
            'PreToolUse': 'pre-tool-use.py',
            'PostToolUse': 'report-activity.py',
            'Stop': 'session-idle.py',
            'SessionEnd': 'unregister-session.py',
        },
        'statusline': 'statusline.sh',
    },
    'cursor': {
        'name': 'Cursor Native',
        'description': 'Cursor Native AI (sidebar chat)',
        'config_template': SCRIPT_DIR / 'cursor' / 'hooks.json.template',
        'hooks_subdir': 'cursor',
        'hooks': {
            'sessionStart': 'session-start.py',
            'sessionEnd': 'session-end.py',
            'postToolUse': 'post-tool-use.py',
            'preCompact': 'pre-compact.py',
        },
    },
}


# ============================================================================
# Utility Functions
# ============================================================================

def log(message: str, level: str = 'info') -> None:
    """Print a log message with color."""
    colors = {
        'info': '\033[0m',      # Default
        'success': '\033[92m',  # Green
        'warning': '\033[93m',  # Yellow
        'error': '\033[91m',    # Red
    }
    reset = '\033[0m'
    color = colors.get(level, colors['info'])
    prefix = {
        'info': '  ',
        'success': '✓ ',
        'warning': '⚠ ',
        'error': '✗ ',
    }.get(level, '  ')
    print(f"{color}{prefix}{message}{reset}")


def backup_file(path: Path) -> Optional[Path]:
    """Create a backup of a file. Returns backup path or None if file doesn't exist."""
    if not path.exists():
        return None
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = path.parent / f"{path.name}.backup_{timestamp}"
    shutil.copy2(path, backup_path)
    log(f"Backed up {path} → {backup_path}", 'info')
    return backup_path


def ensure_directory(path: Path) -> None:
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)


# ============================================================================
# Installation Functions
# ============================================================================

def install_hook_files(source: str) -> bool:
    """
    Install hook files to ~/.jacques/hooks/{source}/
    
    Returns True if successful.
    """
    config = SOURCES[source]
    hooks_subdir = config['hooks_subdir']
    
    # Source and destination directories
    src_dir = SCRIPT_DIR / hooks_subdir
    dst_dir = HOOKS_DIR / hooks_subdir
    adapters_src = SCRIPT_DIR / 'adapters'
    adapters_dst = HOOKS_DIR / 'adapters'
    
    if not src_dir.exists():
        log(f"Source directory not found: {src_dir}", 'error')
        return False
    
    # Create destination directories
    ensure_directory(dst_dir)
    ensure_directory(adapters_dst)
    
    # Copy adapters
    log(f"Installing adapters to {adapters_dst}", 'info')
    for file in adapters_src.glob('*.py'):
        dst_file = adapters_dst / file.name
        # Skip if source and dest are the same file (e.g., symlinks)
        try:
            if file.resolve() == dst_file.resolve():
                log(f"  Skipped {file.name} (same file)", 'info')
                continue
        except:
            pass
        shutil.copy2(file, dst_file)
        log(f"  Copied {file.name}", 'info')
    
    # Copy hook files
    log(f"Installing {config['name']} hooks to {dst_dir}", 'info')
    for hook_name, filename in config['hooks'].items():
        src_file = src_dir / filename
        if src_file.exists():
            dst_file = dst_dir / filename
            # Skip if source and dest are the same file
            try:
                if src_file.resolve() == dst_file.resolve():
                    log(f"  {hook_name} → {filename} (already linked)", 'success')
                    continue
            except:
                pass
            shutil.copy2(src_file, dst_file)
            # Make executable
            os.chmod(dst_file, 0o755)
            log(f"  {hook_name} → {filename}", 'success')
        else:
            log(f"  Missing: {filename}", 'warning')
    
    # Copy statusline script if exists
    if 'statusline' in config:
        statusline_src = src_dir / config['statusline']
        if statusline_src.exists():
            statusline_dst = dst_dir / config['statusline']
            # Skip if source and dest are the same file
            try:
                if statusline_src.resolve() == statusline_dst.resolve():
                    log(f"  statusLine → {config['statusline']} (already linked)", 'success')
                else:
                    shutil.copy2(statusline_src, statusline_dst)
                    os.chmod(statusline_dst, 0o755)
                    log(f"  statusLine → {config['statusline']}", 'success')
            except:
                shutil.copy2(statusline_src, statusline_dst)
                os.chmod(statusline_dst, 0o755)
                log(f"  statusLine → {config['statusline']}", 'success')
    
    return True


def install_claude_code() -> bool:
    """
    Install Claude Code hooks by updating ~/.claude/settings.json
    
    Returns True if successful.
    """
    # First, install hook files
    if not install_hook_files('claude_code'):
        return False
    
    config = SOURCES['claude_code']
    settings_path = config['config_path']
    
    # Load or create settings
    settings: Dict[str, Any] = {}
    if settings_path.exists():
        backup_file(settings_path)
        try:
            with open(settings_path, 'r') as f:
                settings = json.load(f)
        except json.JSONDecodeError:
            log(f"Invalid JSON in {settings_path}, creating new", 'warning')
            settings = {}
    
    # Build hooks configuration
    hooks_base = str(HOOKS_DIR / config['hooks_subdir'])
    
    hooks_config = {
        'SessionStart': [f"python3 {hooks_base}/register-session.py"],
        'PreToolUse': [f"python3 {hooks_base}/pre-tool-use.py"],
        'PostToolUse': [f"python3 {hooks_base}/report-activity.py"],
        'Stop': [f"python3 {hooks_base}/session-idle.py"],
        'SessionEnd': [f"python3 {hooks_base}/unregister-session.py"],
    }
    
    # Build statusLine configuration
    statusline_path = f"{hooks_base}/statusline.sh"
    
    # Update settings
    settings['hooks'] = hooks_config
    settings['statusLine'] = statusline_path
    
    # Write settings
    ensure_directory(settings_path.parent)
    with open(settings_path, 'w') as f:
        json.dump(settings, f, indent=2)
    
    log(f"Updated {settings_path}", 'success')
    log("Claude Code hooks installed successfully!", 'success')
    
    return True


def install_cursor(project_path: Optional[Path] = None) -> bool:
    """
    Install Cursor hooks by copying hooks.json template.
    
    Args:
        project_path: Optional project directory. If not provided, installs globally.
    
    Returns True if successful.
    """
    # First, install hook files
    if not install_hook_files('cursor'):
        return False
    
    config = SOURCES['cursor']
    template_path = config['config_template']
    
    if not template_path.exists():
        log(f"Template not found: {template_path}", 'error')
        return False
    
    # Determine destination
    if project_path:
        dest_path = project_path / '.cursor' / 'hooks.json'
    else:
        # Print instructions for manual installation
        log("Cursor hooks installed to ~/.jacques/hooks/cursor/", 'success')
        log("", 'info')
        log("To enable for a project, copy the template:", 'info')
        log(f"  cp {template_path} /path/to/project/.cursor/hooks.json", 'info')
        log("", 'info')
        log("Or copy to current directory:", 'info')
        log(f"  mkdir -p .cursor && cp {template_path} .cursor/hooks.json", 'info')
        return True
    
    # Copy template
    ensure_directory(dest_path.parent)
    if dest_path.exists():
        backup_file(dest_path)
    
    shutil.copy2(template_path, dest_path)
    log(f"Installed hooks to {dest_path}", 'success')
    log("Cursor hooks installed successfully!", 'success')
    
    return True


def install_source(source: str, project_path: Optional[Path] = None) -> bool:
    """Install hooks for a specific source."""
    if source not in SOURCES:
        log(f"Unknown source: {source}", 'error')
        log(f"Available sources: {', '.join(SOURCES.keys())}", 'info')
        return False
    
    log(f"Installing {SOURCES[source]['name']} hooks...", 'info')
    
    if source == 'claude_code':
        return install_claude_code()
    elif source == 'cursor':
        return install_cursor(project_path)
    
    return False


def install_all() -> bool:
    """Install all available sources."""
    success = True
    for source in SOURCES:
        log(f"\n--- {SOURCES[source]['name']} ---", 'info')
        if not install_source(source):
            success = False
    return success


# ============================================================================
# Status Functions
# ============================================================================

def check_status() -> None:
    """Check installation status for all sources."""
    log("Jacques Hook Installation Status", 'info')
    log("=" * 40, 'info')
    
    # Check ~/.jacques directory
    if JACQUES_HOME.exists():
        log(f"Jacques home: {JACQUES_HOME}", 'success')
    else:
        log(f"Jacques home not found: {JACQUES_HOME}", 'warning')
    
    # Check adapters
    adapters_dir = HOOKS_DIR / 'adapters'
    if adapters_dir.exists() and (adapters_dir / 'base.py').exists():
        log(f"Adapters: Installed", 'success')
    else:
        log(f"Adapters: Not installed", 'warning')
    
    log("", 'info')
    
    # Check each source
    for source, config in SOURCES.items():
        log(f"{config['name']}:", 'info')
        
        # Check hooks directory
        hooks_dir = HOOKS_DIR / config['hooks_subdir']
        if hooks_dir.exists():
            hook_count = len(list(hooks_dir.glob('*.py')))
            log(f"  Hooks directory: {hooks_dir} ({hook_count} files)", 'success')
        else:
            log(f"  Hooks directory: Not found", 'warning')
        
        # Check config file
        if source == 'claude_code':
            settings_path = config['config_path']
            if settings_path.exists():
                try:
                    with open(settings_path, 'r') as f:
                        settings = json.load(f)
                    if 'hooks' in settings:
                        log(f"  Config: {settings_path} (hooks configured)", 'success')
                    else:
                        log(f"  Config: {settings_path} (no hooks)", 'warning')
                except:
                    log(f"  Config: {settings_path} (invalid JSON)", 'error')
            else:
                log(f"  Config: Not found", 'warning')
        
        log("", 'info')


def list_sources() -> None:
    """List available sources."""
    log("Available Sources:", 'info')
    log("=" * 40, 'info')
    for source, config in SOURCES.items():
        log(f"  {source}: {config['description']}", 'info')


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Install Jacques hooks for AI tools',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 install.py --source claude_code    Install Claude Code hooks
  python3 install.py --source cursor         Install Cursor hooks  
  python3 install.py --all                   Install all sources
  python3 install.py --list                  List available sources
  python3 install.py --status                Show installation status
        """
    )
    
    parser.add_argument(
        '--source', '-s',
        help='Source to install (claude_code, cursor)',
        choices=list(SOURCES.keys()),
    )
    parser.add_argument(
        '--all', '-a',
        action='store_true',
        help='Install all available sources',
    )
    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List available sources',
    )
    parser.add_argument(
        '--status',
        action='store_true',
        help='Show installation status',
    )
    parser.add_argument(
        '--project', '-p',
        type=Path,
        help='Project directory for Cursor hooks',
    )
    
    args = parser.parse_args()
    
    if args.list:
        list_sources()
        return 0
    
    if args.status:
        check_status()
        return 0
    
    if args.all:
        return 0 if install_all() else 1
    
    if args.source:
        return 0 if install_source(args.source, args.project) else 1
    
    # No arguments - show help
    parser.print_help()
    return 0


if __name__ == '__main__':
    sys.exit(main())
