import type { InferGetStaticPropsType, NextPage, NextPageContext } from "next";
import { getSession } from "next-auth/react";

import { getAdminSSP } from "@/server/utils/admin";

import { permissions } from "@/data/permissions";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
//import { CustomWishlist } from "@/components/admin/custom-wishlist/CustomWishlist";
import Meta from "@/components/content/Meta";

export async function getServerSideProps(context: NextPageContext) {
  const session = await getSession(context);
  const adminProps = await getAdminSSP(
    context,
    permissions.manageCustomWishlist,
  );
  if (!adminProps) {
    return {
      redirect: {
        destination: session?.user?.id
          ? "/unauthorized"
          : "/auth/signin?callbackUrl=/admin/custom-wishlist",
        permanent: false,
      },
    };
  }

  return { props: adminProps };
}

const AdminDonationItemsPage: NextPage<
  InferGetStaticPropsType<typeof getServerSideProps>
> = ({ menuItems }) => {
  return (
    <>
      <Meta title="Custom Wishlist | Admin" />
      <AdminPageLayout
        title="Custom Wishlist"
        menuItems={menuItems}
      ></AdminPageLayout>
    </>
  );
};

export default AdminDonationItemsPage;
