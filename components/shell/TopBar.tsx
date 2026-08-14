"use client";
import { AlertsBell } from "./AlertsBell";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";
import { MobileNav } from "./MobileNav";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-3 backdrop-blur md:px-6">
      <div className="flex items-center gap-1 md:gap-2">
        <MobileNav />
        <TenantSwitcher />
      </div>
      <div className="flex flex-1 justify-center md:max-w-md">
        <SearchTrigger />
      </div>
      <div className="flex items-center gap-2">
        <AlertsBell />
        <UserMenu />
      </div>
    </header>
  );
}
