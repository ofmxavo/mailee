"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Inbox,
  LayoutDashboard,
  Settings,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/dashboard/inbox",
    label: "Inbox",
    icon: Inbox,
  },
  {
    href: "/dashboard/users",
    label: "Users",
    icon: Users,
  },
  {
    href: "/dashboard/personality",
    label: "Personality",
    icon: Sparkles,
  },
  {
    href: "/dashboard/email",
    label: "Email",
    icon: Settings2,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
  },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href)

        return (
          <Button
            key={item.href}
            asChild
            variant={isActive ? "secondary" : "ghost"}
            className={cn("justify-start gap-2", isActive && "font-semibold")}
          >
            <Link href={item.href}>
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          </Button>
        )
      })}
    </nav>
  )
}
