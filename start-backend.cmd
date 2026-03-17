@echo off
cd /d "%~dp0backend"
npx ts-node -r tsconfig-paths/register src/main.ts
