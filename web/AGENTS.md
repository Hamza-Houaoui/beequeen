# Discord VPN Setup (Turkey)

Discord is blocked in Turkey. ProtonVPN is installed and connected (WireGuard via Flatpak).
The solution routes ONLY Discord traffic through VPN, all other apps use normal WiFi.

## Setup

- ProtonVPN WireGuard interface: `proton0` (IP: 10.2.0.2)
- VPN routing table: 3673614916
- WiFi interface: `wlp0s20f3`, gateway: `192.168.28.1`

## How it works

1. Network namespace `discord-vpn` with veth pair (vth-dc-h / vth-dc-n)
2. Namespace traffic goes through VPN table (iif vth-dc-h -> table 3673614916 -> proton0)
3. Host traffic is marked with fwmark 0xdaf6ea44 -> table 100 -> WiFi
4. Discord Flatpak runs in the namespace with proper DBUS/Wayland env vars
5. DNS in namespace uses 1.1.1.1 / 8.8.8.8

## Usage

```bash
# Launch Discord through VPN:
bash ~/discord-vpn.sh run

# Stop everything:
bash ~/discord-vpn.sh stop

# Restart:
bash ~/discord-vpn.sh restart
```

## Key commands

```bash
# Check routing rules:
sudo ip rule show

# Check routing paths:
sudo ip route get 1.1.1.1                          # host
sudo ip netns exec discord-vpn ip route get 1.1.1.1 # namespace

# Manual launch:
sudo ip netns exec discord-vpn sudo -u HAMZA env \
    DISPLAY=:0 \
    XDG_RUNTIME_DIR=/run/user/1000 \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    nohup flatpak run com.discordapp.Discord > /dev/null 2>&1 &
```

## Notes

- ProtonVPN kill switch is active (pvpnksintrf0 interface) - host marked traffic bypasses it via custom table 100
- The fwmark 0xdaf6ea44 is set by ProtonVPN - used for the kill switch exclusion
- Script requires sudo password "1414"
