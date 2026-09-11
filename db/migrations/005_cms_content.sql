-- Dynamic CMS/content source of truth.
CREATE TABLE IF NOT EXISTS cms_content (
  id BIGSERIAL PRIMARY KEY,
  content_key TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT '*',
  payload JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(content_key, locale)
);
CREATE INDEX IF NOT EXISTS idx_cms_content_key_locale ON cms_content(content_key, locale) WHERE active;

CREATE TABLE IF NOT EXISTS site_navigation (
  id BIGSERIAL PRIMARY KEY,
  href TEXT NOT NULL UNIQUE,
  label_key TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO site_navigation(href,label_key,sort_order) VALUES
('/explore','explore',10),('/research','research',20),('/learn','learn',30),('/library','library',40),('/persiapan','prep',50)
ON CONFLICT(href) DO UPDATE SET label_key=EXCLUDED.label_key,sort_order=EXCLUDED.sort_order,active=true;

GRANT SELECT ON cms_content,site_navigation TO cogniflux;
