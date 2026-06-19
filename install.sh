#!/bin/bash

# Solana Payments Skill - Standard Installer
# Installs with recommended defaults. For custom options, use ./install-custom.sh

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

# Standard defaults
SKILLS_DIR="$HOME/.claude/skills"
SKILL_PATH="$SKILLS_DIR/$SKILL_NAME"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_MD_PATH="$CLAUDE_DIR/CLAUDE.md"

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
    echo -e "   ${WHITE}Solana Payment Solution${NC} ${DIM}— accept money that actually settles${NC}"
    echo -e "   ${DIM}Solana Pay · USDC · subscriptions · payment links · off-ramp${NC}"
    echo -e "   ${DIM}+ bundled transaction delivery (fees · confirm/retry · Jito)${NC}"
    echo ""
}

print_help() {
    echo "Solana Payments Skill - Standard Installer"
    echo ""
    echo "Usage: ./install.sh [OPTIONS]"
    echo ""
    echo "Installs with recommended defaults:"
    echo "  - Skill     -> ~/.claude/skills/$SKILL_NAME"
    echo "  - Agents    -> ~/.claude/agents/"
    echo "  - Commands  -> ~/.claude/commands/"
    echo "  - Rules     -> ~/.claude/rules/"
    echo "  - CLAUDE.md -> ~/.claude/"
    echo ""
    echo "Options:"
    echo "  -y, --yes      Skip confirmation prompt"
    echo "  -h, --help     Show this help"
    echo ""
    echo "For custom installation options, use: ./install-custom.sh"
    echo ""
}

print_guide() {
    echo ""
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${WHITE}WHAT IS SOLPAY KIT?${NC}"
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  It turns your AI coding agent into a ${WHITE}Solana payments expert${NC}."
    echo -e "  Solana has no \"Stripe\". This skill gives your agent the full,"
    echo -e "  ${WHITE}safe${NC} playbook to take money and ${WHITE}know you actually got paid${NC}."
    echo ""
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${WHITE}WHAT YOU CAN BUILD WITH IT${NC}"
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
    echo -e "  ${DIM}+ treasury/key safety, sanctions screening, and a tested${NC}"
    echo -e "  ${DIM}  examples suite (npm test) with CI.${NC}"
    echo ""
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${WHITE}HOW TO USE IT (just talk to your agent)${NC}"
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Open your project in Claude Code / Cursor and ask in plain"
    echo -e "  English. The agent loads the right part of the skill by itself."
    echo ""
    echo -e "  ${WHITE}Example prompts (copy-paste):${NC}"
    echo -e "    ${ORANGE}›${NC} \"Let customers pay me in USDC and confirm on-chain\""
    echo -e "    ${ORANGE}›${NC} \"Make a Solana Pay QR / payment link for order #123\""
    echo -e "    ${ORANGE}›${NC} \"Build a \$10/month subscription with a bounded delegate\""
    echo -e "    ${ORANGE}›${NC} \"Make sure a duplicate webhook can't double-charge\""
    echo -e "    ${ORANGE}›${NC} \"Turn this payment into a Blink I can post in X / Discord\""
    echo -e "    ${ORANGE}›${NC} \"Accept PYUSD and screen wallets against sanctions\""
    echo -e "    ${ORANGE}›${NC} \"Let users cash out USDC to a bank (off-ramp)\""
    echo ""
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${WHITE}COMMANDS (type these to the agent)${NC}"
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${ORANGE}/verify-payment${NC} <reference or signature>"
    echo -e "      Checks on-chain that the right amount/token/recipient paid."
    echo -e "  ${ORANGE}/payments-audit${NC}"
    echo -e "      Scans your checkout/subscription code for money-losing bugs."
    echo -e "  ${ORANGE}/diagnose-tx${NC} <signature>"
    echo -e "      Decodes why a transaction failed and how to fix it."
    echo ""
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${WHITE}THE SAFETY RULES IT ALWAYS FOLLOWS${NC}"
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}•${NC} Check the blockchain, never trust the browser \"success\""
    echo -e "  ${GREEN}•${NC} Never charge or credit the same payment twice"
    echo -e "  ${GREEN}•${NC} Never approve unlimited spending for subscriptions"
    echo -e "  ${GREEN}•${NC} Wait for \"finalized\" before shipping / paying out"
    echo ""
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${WHITE}WHERE IT IS & WHAT'S NEXT${NC}"
    echo -e "${ORANGE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Installed to: ${CYAN}$SKILL_PATH${NC}"
    echo -e "  The ${WHITE}transaction-delivery layer is bundled in${NC} — every payment"
    echo -e "  lands reliably (dynamic fees, confirm/retry, Jito) out of the box."
    echo ""
    echo -e "  ${DIM}If a command isn't recognized, restart your agent so it picks${NC}"
    echo -e "  ${DIM}up the new commands.${NC}"
}

# Parse arguments
SKIP_CONFIRM=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes) SKIP_CONFIRM=true; shift ;;
        -h|--help) print_help; exit 0 ;;
        *) echo "Unknown option: $1"; echo "Use --help for usage information"; exit 1 ;;
    esac
done

print_banner

# Validate source
if [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
    echo -e "${RED}Error:${NC} SKILL.md not found in '$SOURCE_DIR'"
    exit 1
fi

echo -e "${WHITE}Standard Installation${NC}"
echo ""
echo -e "This will install:"
echo -e "  ${BLUE}•${NC} skill     -> ${CYAN}$SKILL_PATH${NC}"
echo -e "  ${BLUE}•${NC} agents    -> ${CYAN}$CLAUDE_DIR/agents${NC}"
echo -e "  ${BLUE}•${NC} commands  -> ${CYAN}$CLAUDE_DIR/commands${NC}"
echo -e "  ${BLUE}•${NC} rules     -> ${CYAN}$CLAUDE_DIR/rules${NC}"
echo -e "  ${BLUE}•${NC} CLAUDE.md -> ${CYAN}$CLAUDE_MD_PATH${NC}"
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
    read -p "Proceed with installation? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}Installation cancelled${NC}"
        echo -e "For custom options, run: ${CYAN}./install-custom.sh${NC}"
        exit 0
    fi
fi

echo ""

# Create directories
mkdir -p "$SKILLS_DIR" "$CLAUDE_DIR"

# [1/3] Install skill
echo -e "${CYAN}[1/3]${NC} Installing skill..."
if [ -d "$SKILL_PATH" ]; then
    echo -e "  ${YELLOW}→${NC} Removing existing installation"
    rm -rf "$SKILL_PATH"
fi
mkdir -p "$SKILL_PATH"
cp -r "$SOURCE_DIR"/* "$SKILL_PATH/"
echo -e "  ${GREEN}✓${NC} Installed to $SKILL_PATH"

# [2/3] Install agents, commands, rules
echo -e "${CYAN}[2/3]${NC} Installing agents, commands, rules..."
for dir in agents commands rules; do
    if [ -d "$SCRIPT_DIR/$dir" ]; then
        mkdir -p "$CLAUDE_DIR/$dir"
        cp -r "$SCRIPT_DIR/$dir"/* "$CLAUDE_DIR/$dir/"
        echo -e "  ${GREEN}✓${NC} $dir -> $CLAUDE_DIR/$dir"
    fi
done

# [3/3] Install CLAUDE.md
echo -e "${CYAN}[3/3]${NC} Installing CLAUDE.md..."
if [ -f "$CLAUDE_MD_PATH" ]; then
    echo -e "  ${YELLOW}→${NC} Backing up existing CLAUDE.md to CLAUDE.md.backup"
    cp "$CLAUDE_MD_PATH" "$CLAUDE_MD_PATH.backup"
fi
cp "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_MD_PATH"
echo -e "  ${GREEN}✓${NC} Installed to $CLAUDE_MD_PATH"

# Done
echo ""
echo -e "${GREEN}  ✓ Installation complete — SOLPAY KIT is ready.${NC}"
print_guide
echo ""
