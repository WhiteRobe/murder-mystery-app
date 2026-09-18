# 05 · bat 约定（ASCII · 零中文 · 无绝对路径）

## 硬约束

| 项 | 要求 | 原因 |
|----|------|------|
| 编码 | ASCII / GBK 兼容（**不要 UTF-8 BOM**） | 部分 Windows 旧版 console 不能解析 UTF-8 |
| 内容 | **echo / title / 注释 不能含中文** | 编码兼容；脚本可移植；与用户硬约束一致 |
| 路径 | **禁止 `cd C:\...` 绝对路径** | 用 `%~dp0` 切到脚本所在目录；保证可移植 |
| 启动 URL | **必须打印 `http://<ip>:<port>/` 与 `http://<ip>:<port>/host`** | 用户硬约束 |

## 三件套

| 文件 | 用途 | 必备 echo 内容 |
|------|------|----------------|
| `install.bat` | 检查 Node.js 环境 | `[ERROR] / [OK] / [TIP]` |
| `start.bat` | 启动 Node.js 服务 | `Starting ... DM Server` + 双 URL |
| `stop.bat` | 停止服务 | `Stopping on port N` + `Killed PID X` |

## 关键技巧

### 1. 切到脚本所在目录

```bat
cd /d "%~dp0"
```

`%~dp0` 是脚本所在目录的盘符+路径（带尾随 `\`）。`/d` 允许跨盘符。

### 2. 检查 Node.js 是否安装

```bat
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not detected. Install from https://nodejs.org/
  pause
  exit /b 1
)
node -v
```

### 3. 读 data.json 端口（避免硬编码）

```bat
for /f "delims=" %%P in ('node -e "console.log(require('./data.json').settings.port)"') do set PORT=%%P
```

### 4. 取局域网 IP

```bat
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "LAN_IP=%%a"
  goto :show
)
:show
echo LAN IP: %LAN_IP%
```

### 5. 端口占用停止（用 netstat 取 PID）

```bat
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  echo Killing PID %%a
  taskkill /PID %%a /F >nul 2>nul
)
```

### 6. 启动后窗口保持开启

- `pause` 在 bat 末尾：node 进程退出后保持窗口可见。
- `title XXX` 改窗口标题（ASCII）。
- node 进程不退出 → bat 也不会走到 `pause`。
- node 异常崩溃 → bat 会执行 `echo Server exited` + `pause`，方便看错误。

## 完整 start.template.bat

```bat
@echo off
title Murder Mystery DM Server
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] node not found. Run install.bat first.
  pause
  exit /b 1
)

for /f "delims=" %%P in ('node -e "try{console.log(require('./data.json').settings.port)}catch(e){console.log(3000)}"') do set PORT=%%P

echo ===============================================
echo   Murder Mystery DM Server - Port %PORT%
echo ===============================================
echo   Player Entry:  http://localhost:%PORT%/
echo   DM Console:    http://localhost:%PORT%/host
echo ===============================================
echo   Keep this window open. Closing stops the server.
echo.

node server.js

echo.
echo Server exited.
pause
```

## 完整 install.template.bat

```bat
@echo off
title Murder Mystery - Install Check
echo ============================================
echo   Murder Mystery DM Server - Install Check
echo ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not detected.
  echo         Download LTS from https://nodejs.org/
  echo.
  echo Install Node.js first, then re-run install.bat
  pause
  exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

if not exist "data.json" (
  echo [INFO] data.json not found. Will be auto-generated on first start.
) else (
  echo [OK] data.json found.
)
echo [TIP] Zero npm dependencies required.
echo [TIP] Edit data.json settings.port to change port.
echo.

echo Install check passed. Double-click start.bat to launch.
pause
```

## 完整 stop.template.bat

```bat
@echo off
title Murder Mystery - Stop Server
cd /d "%~dp0"

set PORT=3000
if exist "data.json" (
  for /f "delims=" %%P in ('node -e "try{console.log(require('./data.json').settings.port)}catch(e){console.log(3000)}"') do set PORT=%%P
)

echo Stopping server on port %PORT% ...

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  set FOUND=1
  echo Killing PID %%a
  taskkill /PID %%a /F >nul 2>nul
)

if %FOUND%==0 echo No process listening on port %PORT%.

echo Done.
pause
```

## 反例（绝对禁止）

### ❌ 写中文 echo
```bat
echo 服务端启动中...        ← 错！改成 echo Starting server...
echo 端口：3000             ← 错！改成 echo Port: 3000
```

### ❌ 写绝对路径
```bat
cd C:\Users\Admin\project\server    ← 错！改成 cd /d "%~dp0"
node C:\Users\Admin\server.js       ← 错！改成 node server.js（已经 cd 过去了）
```

### ❌ 用 chcp 改 UTF-8 但写中文
```bat
chcp 65001 >nul
echo 启动中                   ← 即使 chcp 改了，bat 文件保存编码也会出问题
```

**正解**：整个 bat 用纯 ASCII 保存 + `echo` 输出 ASCII。

### ❌ 用 `&&` 串联命令
PowerShell 支持 `;`，但 `cmd.exe` 与 bat 默认是 `&&`。为了兼容性用：
```bat
call cmd1
if errorlevel 1 (echo Failed & exit /b 1)
call cmd2
```

或单行：
```bat
call cmd1 && call cmd2 || (echo Failed & exit /b 1)
```

### ❌ 用 pause 阻塞导致 node 退出困难
- node 进程不退 → bat 永远停在那行，不会执行 `pause`。
- node 异常退出 → bat 继续执行 `echo Server exited` + `pause`，看错误。

## 测试 bat

用记事本打开 bat 文件，确认：
- 没有任何中文（用 "查找中文" 插件或肉眼）。
- 没有 `C:\` / `D:\` 这类绝对路径（除了 `https://nodejs.org/`）。
- `title` 是 ASCII。
- 所有 `echo` 是 ASCII。

## 实战：检查脚本（可参考）

```bat
@echo off
echo Checking bat for forbidden chars ...
findstr /R /C:"[\u4e00-\u9fa5]" "%~dp0start.bat" >nul 2>nul
if %errorlevel% equ 0 (
  echo [FAIL] start.bat contains Chinese chars
) else (
  echo [OK] start.bat is ASCII
)
pause
```

（Windows findstr 不支持 Unicode 范围；实际可换成 PowerShell 脚本检查，但一般肉眼即可。）