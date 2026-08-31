# Raspberry Pi Private Network Source Note

The Raspberry Pi local scanner-monitor guide uses the Raspberry Pi Foundation’s official hotspot setup approach. It documents identifying the Wi-Fi interface with `nmcli device` and creating a hotspot with `sudo nmcli device wifi hotspot ssid <name> password <password> ifname wlan0`. The official guide also describes joining the new hotspot from another computer and using a local network without relying on the venue connection.

[1]: https://www.raspberrypi.com/tutorials/host-a-hotel-wifi-hotspot/ "Host a Wi-Fi hotspot with a Raspberry Pi"
