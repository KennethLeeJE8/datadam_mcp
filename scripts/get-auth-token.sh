#!/bin/bash

# Authentication Helper Script for DataDam MCP Server
# This script helps users get JWT tokens from Supabase Auth for testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DataDam MCP Server - Authentication Token Helper           ║${NC}"
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "${YELLOW}Please create a .env file with your Supabase credentials${NC}"
    exit 1
fi

# Load environment variables
source .env

# Validate required environment variables
if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}Error: SUPABASE_URL not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}Supabase URL: ${SUPABASE_URL}${NC}"
echo ""
echo -e "${YELLOW}Choose authentication method:${NC}"
echo "  1) Sign up new user"
echo "  2) Sign in existing user"
echo "  3) Get anonymous token (if enabled)"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo -e "\n${BLUE}=== Sign Up New User ===${NC}"
        read -p "Email: " email
        read -sp "Password: " password
        echo ""

        response=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
            -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"email\":\"${email}\",\"password\":\"${password}\"}")
        ;;
    2)
        echo -e "\n${BLUE}=== Sign In Existing User ===${NC}"
        read -p "Email: " email
        read -sp "Password: " password
        echo ""

        response=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
            -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"email\":\"${email}\",\"password\":\"${password}\"}")
        ;;
    3)
        echo -e "\n${BLUE}=== Get Anonymous Token ===${NC}"
        response=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
            -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"options\":{\"data\":{\"is_anonymous\":true}}}")
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

# Parse response
access_token=$(echo $response | jq -r '.access_token // empty')
error_message=$(echo $response | jq -r '.error_description // .msg // empty')

if [ -n "$access_token" ] && [ "$access_token" != "null" ]; then
    echo ""
    echo -e "${GREEN}✓ Authentication successful!${NC}"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Access Token:${NC}"
    echo -e "${YELLOW}${access_token}${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Decode JWT to show claims
    user_id=$(echo $response | jq -r '.user.id // empty')
    email=$(echo $response | jq -r '.user.email // empty')

    if [ -n "$user_id" ]; then
        echo -e "${GREEN}User ID:${NC} ${user_id}"
    fi
    if [ -n "$email" ]; then
        echo -e "${GREEN}Email:${NC} ${email}"
    fi

    echo ""
    echo -e "${BLUE}Usage:${NC}"
    echo "  1. Copy the access token above"
    echo "  2. Include in HTTP requests:"
    echo ""
    echo -e "${YELLOW}     Authorization: Bearer ${access_token:0:20}...${NC}"
    echo ""
    echo "  3. Example curl command:"
    echo ""
    echo -e "${YELLOW}     curl -X POST ${SERVER_URL:-http://localhost:3000}/mcp \\${NC}"
    echo -e "${YELLOW}       -H \"Authorization: Bearer ${access_token:0:20}...\" \\${NC}"
    echo -e "${YELLOW}       -H \"Content-Type: application/json\" \\${NC}"
    echo -e "${YELLOW}       -d '{\"jsonrpc\":\"2.0\",\"method\":\"ping\"}'${NC}"
    echo ""

    # Save to file option
    read -p "Save token to file? (y/n): " save_choice
    if [ "$save_choice" = "y" ]; then
        echo "$access_token" > .auth-token
        echo -e "${GREEN}✓ Token saved to .auth-token${NC}"
        echo -e "${YELLOW}WARNING: Keep this file secure and don't commit it to git${NC}"
    fi
else
    echo ""
    echo -e "${RED}✗ Authentication failed${NC}"
    if [ -n "$error_message" ]; then
        echo -e "${RED}Error: ${error_message}${NC}"
    else
        echo -e "${YELLOW}Response:${NC}"
        echo "$response" | jq '.'
    fi
    exit 1
fi
