import { RefreshCw, RefreshCwOff } from "lucide-react";
import { AccountMenu as Menu, type MenuAction } from "@scholarkit/account-menu";
import type { Account, Usage } from "@scholarkit/editor/lib/account";
import { t } from "@scholarkit/i18n";

/**
 * The signed-in account at the end of the header, the same menu as in Binder, Polemic and on
 * the Scholarkit home page: who is signed in, the plan with its usage, whether the open project
 * syncs (in the desktop app), Upgrade, the account page and Sign out.
 */
export function AccountMenu({
  account,
  loadUsage,
  linked,
  onLink,
  onUnlink,
  onManage,
  onUpgrade,
  external = true,
  onSignOut,
}: {
  /** The signed-in account; null while its name can't be fetched. */
  account: Account | null;
  /** GET /api/usage, each time the menu opens. */
  loadUsage?: () => Promise<Usage | null>;
  /** Whether the open project syncs with the account; undefined in the browser, where it always does. */
  linked?: boolean;
  onLink?: () => Promise<void>;
  onUnlink?: () => Promise<void>;
  onManage: () => void;
  /** Opens the plan on the account page. */
  onUpgrade?: () => void;
  /** Whether the account page opens in the browser, outside the app. */
  external?: boolean;
  onSignOut: () => Promise<void>;
}) {
  const syncs = linked !== undefined && onLink && onUnlink;
  const actions: MenuAction[] = !syncs
    ? []
    : linked
      ? [
          {
            label: t("Stop syncing this project"),
            icon: <RefreshCwOff aria-hidden />,
            run: onUnlink,
          },
        ]
      : [
          {
            label: t("Sync this project to your account"),
            icon: <RefreshCw aria-hidden />,
            run: onLink,
          },
        ];
  return (
    <Menu
      account={account && { ...account, photo: account.image }}
      plan={account?.plan}
      loadUsage={loadUsage}
      note={
        syncs
          ? linked
            ? t("This project syncs with your account.")
            : t("This project is only on this computer.")
          : undefined
      }
      actions={actions}
      onManage={onManage}
      onUpgrade={onUpgrade}
      external={external}
      onSignOut={onSignOut}
    />
  );
}
