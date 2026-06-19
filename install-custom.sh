#!/bin/bash

# Solana Payments Skill - Custom Installer
# Full control over location and which components to install.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
ORANGE='\033[1;38;5;209m'
DIM='\033[2m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/skill"
SKILL_NAME="solana-payments"

PERSONAL_SKILLS_DIR="$HOME/.claude/skills"
PROJECT_SKILLS_DIR=".claude/skills"

INSTALL_BASE=""
SKILL_INSTALL_PATH=""
CLAUDE_BASE=""

print_banner() {
    echo ""
    printf '%b' "$ORANGE"
    cat <<'EOF'
   ███████╗ ██████╗ ██╗     ██████╗  █████╗ ██╗   ██╗
   ██╔════╝██╔═══██╗██║     ██╔══██╗██╔══██╗╚██╗ ██╔╝
   ███████╗██║   ██║██║     ██████╔╝███████║ ╚████╔╝
   ╚════██║██║   ██║██║     ██╔═══╝ ██╔══██║  ╚██╔╝
   ███████║╚██████╔╝███████╗██║     ██║  ██║   ██║
   ╚══════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝   ╚═╝
                ██╗  ██╗██╗████████╗
                ██║ ██╔╝██║╚══██╔══╝
                █████╔╝ ██║   ██║
                ██╔═██╗ ██║   ██║
                ██║  ██╗██║   ██║
                ╚═╝  ╚═╝╚═╝   ╚═╝
EOF
    printf '%b' "$NC"
    echo ""
    echo -e "   ${WHITE}Solana Payment Solution${NC} ${DIM}— custom installer${NC}"
    echo -e "   ${DIM}commerce + bundled transaction delivery${NC}"
    echo ""
}

print_guide() {
    echo ""
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${WHITE}WHAT YOU CAN BUILD WITH SOLPAY KIT${NC}"
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${ORANGE}1.${NC} ${WHITE}Accept a payment${NC}  — Solana Pay links/QRs, pay in USDC"
    echo -e "  ${ORANGE}2.${NC} ${WHITE}Verify a payment${NC} — confirm on-chain it really paid"
    echo -e "  ${ORANGE}3.${NC} ${WHITE}Subscriptions${NC}    — charge \$X every month, safely"
    echo -e "  ${ORANGE}4.${NC} ${WHITE}Payment links${NC}    — shareable invoices / checkout pages"
    echo -e "  ${ORANGE}5.${NC} ${WHITE}Blinks & mobile${NC}  — pay buttons in X/Discord + phone/POS"
    echo -e "  ${ORANGE}6.${NC} ${WHITE}Any stablecoin${NC}   — USDC, PYUSD, EURC (+ Token-2022 fees)"
    echo -e "  ${ORANGE}7.${NC} ${WHITE}Cash out (fiat)${NC}  — send USDC to a bank via an off-ramp"
    echo -e "  ${ORANGE}8.${NC} ${WHITE}Reliable landing${NC} — fees, retries & Jito so payments don't drop"
    echo ""
    echo -e "  ${DIM}+ treasury/key safety, sanctions screening, tested examples (npm test) + CI.${NC}"
    echo ""
    echo -e "  ${WHITE}Just ask your agent in plain English, e.g.:${NC}"
    echo -e "    ${ORANGE}›${NC} \"Let customers pay me in USDC and confirm on-chain\""
    echo -e "    ${ORANGE}›${NC} \"Build a \$10/month subscription with a bounded delegate\""
    echo -e "    ${ORANGE}›${NC} \"Turn this payment into a Blink for X / Discord\""
    echo ""
    echo -e "  ${WHITE}Commands:${NC}  ${ORANGE}/verify-payment${NC} <ref|sig>   ${ORANGE}/payments-audit${NC}   ${ORANGE}/diagnose-tx${NC} <sig>"
    echo ""
    echo -e "  ${DIM}Transaction-delivery layer is bundled in — payments land reliably out of the box.${NC}"
}

print_help() {
    echo "Solana Payments Skill - Custom Installer"
    echo ""
    echo "Usage: ./install-custom.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --project        Install to current project (.claude/skills/)"
    echo "  --path PATH      Install skills to a custom base path"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Interactive by default: choose location and which components to copy."
    echo ""
}

prompt_install_location() {
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${WHITE}Select Installation Location${NC}                               ${CYAN}│${NC}"
    echo -e "${CYAN}└─────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "  ${WHITE}[1]${NC} ${GREEN}Personal${NC} (~/.claude/skills/)   - available to all projects"
    echo -e "  ${WHITE}[2]${NC} ${GREEN}Current project${NC} (./.claude/skills/) - this project only"
    echo -e "  ${WHITE}[3]${NC} ${RED}Cancel${NC}"
    echo ""
    read -p "Select option [1-3]: " choice
    case $choice in
        1) INSTALL_BASE="$PERSONAL_SKILLS_DIR"; CLAUDE_BASE="$HOME/.claude" ;;
        2) INSTALL_BASE="$PROJECT_SKILLS_DIR"; CLAUDE_BASE=".claude" ;;
        3) echo -e "${YELLOW}Installation cancelled${NC}"; exit 0 ;;
        *) echo -e "${RED}Invalid option. Cancelled${NC}"; exit 1 ;;
    esac
    SKILL_INSTALL_PATH="$INSTALL_BASE/$SKILL_NAME"
}

copy_optional_dir() {
    local dir="$1"
    [ -d "$SCRIPT_DIR/$dir" ] || return 0
    read -p "Install $dir/? [Y/n] " -n 1 -r; echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        mkdir -p "$CLAUDE_BASE/$dir"
        cp -r "$SCRIPT_DIR/$dir"/* "$CLAUDE_BASE/$dir/"
        echo -e "  ${GREEN}✓${NC} $dir -> $CLAUDE_BASE/$dir"
    else
        echo -e "  ${YELLOW}→${NC} Skipped $dir"
    fi
}

install_claude_md() {
    echo ""
    echo -e "${CYAN}━━━ CLAUDE.md Configuration ━━━${NC}"
    echo -e "  ${WHITE}[1]${NC} Copy to ${GREEN}current directory${NC} (./CLAUDE.md)"
    echo -e "  ${WHITE}[2]${NC} Copy to ${GREEN}home${NC} (~/.claude/CLAUDE.md)"
    echo -e "  ${WHITE}[3]${NC} ${YELLOW}Skip${NC}"
    echo ""
    read -p "Select option [1-3]: " c
    case $c in
        1)
            [ -f "./CLAUDE.md" ] && cp "./CLAUDE.md" "./CLAUDE.md.backup"
            cp "$SCRIPT_DIR/CLAUDE.md" "./CLAUDE.md"
            echo -e "  ${GREEN}✓${NC} Copied to ./CLAUDE.md" ;;
        2)
            mkdir -p "$HOME/.claude"
            [ -f "$HOME/.claude/CLAUDE.md" ] && cp "$HOME/.claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md.backup"
            cp "$SCRIPT_DIR/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
            echo -e "  ${GREEN}✓${NC} Copied to ~/.claude/CLAUDE.md" ;;
        *) echo -e "  ${YELLOW}→${NC} Skipped CLAUDE.md" ;;
    esac
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project) INSTALL_BASE="$PROJECT_SKILLS_DIR"; CLAUDE_BASE=".claude"; shift ;;
        --path) INSTALL_BASE="$2"; CLAUDE_BASE="$(dirname "$2")"; shift 2 ;;
        -h|--help) print_help; exit 0 ;;
        *) echo "Unknown option: $1"; echo "Use --help for usage information"; exit 1 ;;
    esac
done

print_banner

if [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
    echo -e "${RED}Error:${NC} SKILL.md not found in '$SOURCE_DIR'"
    exit 1
fi

if [ -z "$INSTALL_BASE" ]; then
    prompt_install_location
else
    SKILL_INSTALL_PATH="$INSTALL_BASE/$SKILL_NAME"
fi

# Install skill
echo ""
echo -e "${CYAN}━━━ Installing Skill ━━━${NC}"
if [ -d "$SKILL_INSTALL_PATH" ]; then
    read -p "$SKILL_INSTALL_PATH exists. Overwrite? [y/N] " -n 1 -r; echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Skipping skill installation${NC}"
    else
        rm -rf "$SKILL_INSTALL_PATH"
        mkdir -p "$SKILL_INSTALL_PATH"
        cp -r "$SOURCE_DIR"/* "$SKILL_INSTALL_PATH/"
        echo -e "  ${GREEN}✓${NC} Installed to $SKILL_INSTALL_PATH"
    fi
else
    mkdir -p "$SKILL_INSTALL_PATH"
    cp -r "$SOURCE_DIR"/* "$SKILL_INSTALL_PATH/"
    echo -e "  ${GREEN}✓${NC} Installed to $SKILL_INSTALL_PATH"
fi

# Optional components
echo ""
echo -e "${CYAN}━━━ Optional Components ━━━${NC}"
copy_optional_dir agents
copy_optional_dir commands
copy_optional_dir rules

# CLAUDE.md
install_claude_md

# Done
echo ""
echo -e "${GREEN}  ✓ Installation complete — SOLPAY KIT is ready.${NC}"
echo -e "  ${WHITE}Skill:${NC} $SKILL_INSTALL_PATH"
print_guide
echo ""
