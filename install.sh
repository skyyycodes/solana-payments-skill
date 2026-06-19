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
    echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║${NC}                                                               ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${CYAN}Solana Payments Skill${NC}                                       ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}   ${WHITE}Accept money that settles — Pay, USDC, subscriptions${NC}        ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}║${NC}                                                               ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════════╝${NC}"
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
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  ${WHITE}Installation Complete!${NC}                                       ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Try asking your agent:${NC}"
echo -e "  ${BLUE}•${NC} \"Let customers pay me in USDC and confirm when they've paid\""
echo -e "  ${BLUE}•${NC} \"Generate a Solana Pay QR / payment link for an order\""
echo -e "  ${BLUE}•${NC} \"Build a \$10/month subscription with a bounded delegate\""
echo -e "  ${BLUE}•${NC} \"Did this payment settle?\"  (/verify-payment)"
echo -e "  ${BLUE}•${NC} \"Audit our checkout for payment-safety gaps\"  (/payments-audit)"
echo ""
