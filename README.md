# Карта сокровищ

Проект: сайт-конструктор персональных карт сокровищ для детских квестов.

Идея: родитель загружает реальные места из своего дома, двора, дачи, парка или района, а сервис превращает их в сказочную карту, фрагменты пазла, загадки и готовые макеты для печати, лазерной резки или партнерского изготовления.

Ключевые файлы:

- `01_project_brief.md` - суть продукта и что уже есть в прототипе.
- `02_photo_review.md` - разбор фотографий существующей карты.
- `03_ux_constructor.md` - пользовательский сценарий сайта-конструктора.
- `04_monetization_research.md` - модель монетизации, конкуренты, платежи, производство.
- `05_next_steps.md` - ближайшие практические шаги.
- `Фото карты/` - фотографии старого физического прототипа.

Главная формулировка продукта:

> Персональный семейный квест по реальным местам ребенка: AI превращает знакомые локации в сказочную карту сокровищ, загадки и физический набор для приключения.

## Google Ads API research tool

Treasure Map is a pre-launch personalized children's treasure-hunt product. A parent provides familiar locations from a home, yard, park, or neighborhood, and the product turns those locations into a themed treasure map, clues, riddles, and printable materials for a child's activity.

The repository also contains an internal Google Ads keyword-planning utility for the product owner. The utility supports the planning of Treasure Map's own prospective Google Ads Search campaigns. It uses `KeywordPlanIdeaService` only to:

- generate keyword ideas from campaign seed terms related to children's treasure hunts and scavenger hunts;
- retrieve historical monthly search volume and trend data;
- review competition and bid-range indicators for campaign planning;
- compare potential Search campaign demand across selected countries and languages;
- help decide campaign keywords, geographic targeting, localization priorities, and preliminary budgets.

The tool is used only by the product owner for Treasure Map's own advertising activity. It does not create or manage third-party accounts, is not offered to clients or external users, and is not sold or provided as a public Google Ads API service.

### Intended Google Ads API access

- Company/tool classification: internal advertiser tool
- Intended users: product owner only
- Campaign type: Search
- Google Ads API capability: Keyword Planning Services
- Primary service: `KeywordPlanIdeaService`
- Third-party account access: none
