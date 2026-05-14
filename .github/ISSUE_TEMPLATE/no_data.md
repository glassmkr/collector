---
name: No Data in Dashboard
about: Crucible is running but Dashboard shows no data
---

**Crucible version:**
**OS and version:**
**How long since install:**

**Can you reach Dashboard?**
```
curl -s -o /dev/null -w "%{http_code}" https://app.glassmkr.com/api/health
```

**Service status:**
```
systemctl status glassmkr-crucible
```

**Last 50 log lines:**
```
journalctl -u glassmkr-crucible -n 50 --no-pager
```

**Is smartctl installed?** `which smartctl`
**Is ipmitool installed?** `which ipmitool`
