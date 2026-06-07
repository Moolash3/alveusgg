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
import IconTrash from "@/icons/IconTrash";

type AdminCustomWishlistItemProps = {
  item: CustomWishlistItem;
  activateItem: (item: CustomWishlistItem) => void;
  deleteItem: (item: CustomWishlistItem) => void;
};

const cellClasses = "p-1 md:p-2 align-top tabular-nums";

export function AdminCustomWishlistItem({
  item,
  activateItem,
  deleteItem,
}: AdminCustomWishlistItemProps) {
  return (
    <tr className="border-t border-gray-800">
      <td className={`${cellClasses} font-semibold`}>{item.title}</td>
      <td className={`${cellClasses} whitespace-nowrap`}>
        <DateTime date={item.createdAt} format={{ time: "minutes" }} />
        <br />
        {Number(item.createdAt) !== Number(item.updatedAt) && (
          <DateTime date={item.updatedAt} format={{ time: "minutes" }} />
        )}
      </td>
      <td className={`${cellClasses} font-semibold`}>{item.completedAt ? "Completed" : item.activatedAt ? "Active" : "Pending"}</td>
      <td className={`${cellClasses} font-semibold`}>{item.goal.toString()}</td>
      <td className={`${cellClasses} whitespace-nowrap`}>
        {!item.activatedAt && !item.completedAt && (
          <div className="flex flex-col gap-1">
            <Button
              size="small"
              className={secondaryButtonClasses}
              onClick={() => activateItem(item)}
              title="Activate this item"
            >
              <IconPlus className="size-5" /> Seen
            </Button>
          </div>
        )}
      </td>
      <td className={`${cellClasses} whitespace-nowrap`}>
          <div className="flex flex-col gap-1">
            <Button
              size="small"
              className={dangerButtonClasses}
              onClick={() => deleteItem(item)}
              title="Delete this item"
            >
              <IconTrash className="size-5" /> Seen
            </Button>
          </div>
      </td>
      <td className={`${cellClasses} flex flex-col gap-1`}>
        <LinkButton
          size="small"
          href={`/admin/custom-wishlist/${item.id}`}
        >
          <IconPencil className="size-5" />
          Edit
        </LinkButton>
      </td>
    </tr>
  );
}
