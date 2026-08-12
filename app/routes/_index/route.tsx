import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const features = [
  {
    icon: "⚡",
    title: "Automated Access",
    description:
      "Customers who purchase from a mapped collection automatically receive access to the right creator community.",
  },
  {
    icon: "↩",
    title: "Refund-Aware",
    description:
      "When a qualifying purchase is refunded, community access is automatically revoked.",
  },
  {
    icon: "↻",
    title: "Product Sync",
    description:
      "Product mappings stay synchronized as collections change, keeping community access accurate.",
  },
  {
    icon: "✓",
    title: "Reliable Delivery",
    description:
      "Failed deliveries are retried automatically and every event is logged for complete visibility.",
  },
];

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlow} />

      <div className={styles.container}>
        <header className={styles.header}>
          <img
            src="/brandme-logo.jpg"
            alt="BrandMe Studio"
            className={styles.logo}
          />
        </header>

        <section className={styles.hero}>
          <div className={styles.badge}>
            Shopify + Discourse Community Integration
          </div>

          <h1 className={styles.heading}>
            Turn purchases into
            <span> community access.</span>
          </h1>

          <p className={styles.subtitle}>
            Automatically connect Shopify customers with the right BrandMe
            creator community when they purchase — and keep access synchronized
            when orders change.
          </p>
        </section>

        {showForm && (
          <section className={styles.connectCard}>
            <div className={styles.cardHeader}>
              <div className={styles.storeIcon}>S</div>

              <div>
                <h2>Connect your Shopify store</h2>
                <p>Enter your store domain to get started.</p>
              </div>
            </div>

            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                Shopify store domain
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com"
                    autoComplete="off"
                    required
                  />
                </div>
              </label>

              <button className={styles.button} type="submit">
                Connect Store
                <span aria-hidden="true">→</span>
              </button>
            </Form>

            <p className={styles.secureText}>
              Securely connected through Shopify
            </p>
          </section>
        )}

        <section className={styles.featuresSection}>
          <div className={styles.sectionHeading}>
            <p>HOW IT WORKS</p>
            <h2>Community access, handled automatically</h2>
          </div>

          <div className={styles.features}>
            {features.map((feature) => (
              <article className={styles.feature} key={feature.title}>
                <div className={styles.featureIcon}>{feature.icon}</div>

                <h3>{feature.title}</h3>

                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <img src="/brandme-favicon.svg" alt="" />
          <span>BrandMe Community Access</span>
        </footer>
      </div>
    </main>
  );
}
