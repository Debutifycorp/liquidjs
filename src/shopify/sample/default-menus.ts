import type { LinkListData } from '../store/types'

/**
 * The customer account menu every Shopify store has by default: "If you use customer accounts, then a customer account main menu is also included on your store by default" (https://help.shopify.com/en/manual/online-store/menus-and-links/understanding-navigation), under the handle `customer-account-main-menu` that https://shopify.dev/docs/storefronts/themes/customer-engagement/account-component gives the `link_list` setting as its default, with the links that page lists: "This menu includes links to Orders and Profile". The parity store's menu holds the same two links, but as customer account pages whose URLs carry the store's own number (`https://shopify.com/<shop id>/account/orders`), which a sample dataset has no number for; these are the store's own `/account/orders` and `/account/profile`, which `link.type` reads as `customer_account_page_link`. The main and footer menus come with the mock.shop catalogue (`mock-shop.ts`), which has no customer account menu.
 */
export const customerAccountMainMenu: LinkListData = {
  handle: 'customer-account-main-menu',
  title: 'Customer account main menu',
  links: [
    { title: 'Orders', url: '/account/orders' },
    { title: 'Profile', url: '/account/profile' }
  ]
}
