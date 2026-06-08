import type { CustomWishlistItem } from "@alveusgg/database";

import DateTime from "@/components/content/DateTime";
import {
  Button,
  LinkButton,
  dangerButtonClasses,
  secondaryButtonClasses,
} from "@/components/shared/form/Button";

import IconPencil from "@/icons/IconPencil";
import IconPlus from "@/icons/IconPlus";
import IconMinus from "@/icons/IconMinus";
import IconTrash from "@/icons/IconTrash";
import IconDollar from "@/icons/IconDollar";
import IconCheck from "@/icons/IconCheck";

type AdminCustomWishlistItemProps = {
  item: CustomWishlistItem;
  finalizeItem: (item: CustomWishlistItem) => void;
  deactivateItem: (item: CustomWishlistItem) => void;
  activateItem: (item: CustomWishlistItem) => void;
  completeItem: (item: CustomWishlistItem) => void;
  deleteItem: (item: CustomWishlistItem) => void;
};

const cellClasses = "p-1 md:p-2 align-top tabular-nums";

export function AdminCustomWishlistItem({
  item,
  finalizeItem,
  deactivateItem,
  activateItem,
  completeItem,
  deleteItem,
}: AdminCustomWishlistItemProps) {
  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    unitDisplay: "narrow",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <tr className="border-t border-gray-800">
      <td className={`${cellClasses} font-semibold`}>{item.title}</td>
      <td className={`${cellClasses} font-semibold`}>
        {item.completedAt && item.seenOnStream
          ? "Finalized"
          : item.completedAt
            ? "Completed"
            : item.activatedAt
              ? "Active"
              : "Inactive"}
      </td>
      <td className={`${cellClasses} font-semibold`}>
        {currencyFormatter.format(Number(item.goal))}
      </td>
      <td className={`${cellClasses} whitespace-nowrap`}>
        <DateTime date={item.createdAt} format={{ time: "minutes" }} />
        <br />
        {Number(item.createdAt) !== Number(item.updatedAt) && (
          <DateTime date={item.updatedAt} format={{ time: "minutes" }} />
        )}
      </td>
      <td className={`${cellClasses} whitespace-nowrap`}>
        <div className="flex flex-col gap-1">
          {!item.activatedAt && !item.completedAt && (
            <div className="flex flex-col gap-1">
              <Button
                size="small"
                className={secondaryButtonClasses}
                onClick={() => activateItem(item)}
                title="Activate this item"
              >
                <IconPlus className="size-5" /> Activate
              </Button>
            </div>
          )}
          {item.activatedAt && !item.completedAt && (
            <>
              <Button
                size="small"
                className={secondaryButtonClasses}
                onClick={() => deactivateItem(item)}
                title="Deactivate this item"
              >
                <IconMinus className="size-5" /> Deactivate
              </Button>
              <Button
                size="small"
                className={secondaryButtonClasses}
                onClick={() => completeItem(item)}
                title="Complete this item"
              >
                <IconCheck className="size-5" /> Complete
              </Button>
            </>
          )}
          {item.completedAt && !item.seenOnStream && (
            <Button
              size="small"
              className={secondaryButtonClasses}
              onClick={() => finalizeItem(item)}
              title="Finalize this item"
            >
              <IconTrash className="size-5" /> Finalize
            </Button>
          )}
          {!item.completedAt && (
            <Button
              size="small"
              className={dangerButtonClasses}
              onClick={() => deleteItem(item)}
              title="Delete this item"
            >
              <IconTrash className="size-5" /> Delete
            </Button>
          )}
        </div>
      </td>
      {!item.completedAt && (
        <td className={`${cellClasses} flex flex-col gap-1`}>
          <LinkButton size="small" href={`/admin/custom-wishlist/${item.id}`}>
            <IconPencil className="size-5" />
            Edit
          </LinkButton>
        </td>
      )}
      {(item.activatedAt || item.completedAt) && (
        <td className={`${cellClasses} flex flex-col gap-1`}>
          <LinkButton
            size="small"
            href={`/admin/custom-wishlist/${item.id}/donations`}
          >
            <IconDollar className="size-5" />
            Donations
          </LinkButton>
        </td>
      )}
    </tr>
  );
}
