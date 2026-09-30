# CyberFiles Wheel Input Lab

This standalone WinUI application isolates native mouse-wheel behavior from the CyberFiles explorer prototype. It renders one virtualized `ListView` with 10,000 in-memory rows and no paging, file-system access, dual-pane coordination, focus management, or custom scrolling.

The diagnostics bar reports wheel events and actual `ScrollViewer` view changes separately. This distinguishes missing input from input that reaches WinUI but does not move the list.

Build and run:

```powershell
dotnet build .\native-winui-wheel-lab\CyberFiles.WheelLab.csproj -c Release
.\native-winui-wheel-lab\bin\Release\net10.0-windows10.0.19041.0\win-x64\CyberFiles.WheelLab.exe
```
