UPDATE prep_sources SET name='Pusat Asesmen Pendidikan — TKA (Kemendikdasmen 2026)', url='https://pusmendik.kemendikdasmen.go.id/tka/', last_verified_at=now() WHERE url='https://pusmendik.kemdikbud.go.id/tka/';
UPDATE prep_programs SET official_url='https://pusmendik.kemendikdasmen.go.id/tka/' WHERE slug IN ('tka-sd','tka-smp','tka-sma-smk');
UPDATE prep_subjects SET source_url='https://pusmendik.kemendikdasmen.go.id/tka/' WHERE source_url LIKE '%pusmendik.kemdikbud.go.id%';
UPDATE prep_competencies SET source_url=replace(source_url,'https://pusmendik.kemdikbud.go.id','https://pusmendik.kemendikdasmen.go.id') WHERE source_url LIKE '%pusmendik.kemdikbud.go.id%';
UPDATE prep_material_links SET url=replace(url,'https://pusmendik.kemdikbud.go.id','https://pusmendik.kemendikdasmen.go.id') WHERE url LIKE '%pusmendik.kemdikbud.go.id%';
