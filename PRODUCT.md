# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the average Indian farmer, assumed to have limited reading comfort. Hindi-first; meaning must travel through spoken voice, icons, numbers, and color — never through paragraphs of text. Uses the product standing in the field, often with one free hand, in bright sunlight, on a small cheap Android phone, with patchy or no connectivity. Other audiences (advisors, family members who read) are secondary and must never complicate the primary path.

## Product Purpose

EnviroOS turns raw field-sensor data into plain spoken guidance and automatic action, so a farmer never has to guess what the field needs. Success means: glance at the phone (or ask aloud), understand what to do in seconds, and trust the pump to water on its own. The product exists to make modern sensing technology usable by every farmer, not just literate ones.

## Positioning

Three things a neighboring product could not truthfully copy together: (1) raw units become plain words on every screen — moisture, pH, lux and NPK are always translated into what they mean and what to do; (2) Agri, a live voice assistant that converses in the farmer's own language and explains its advice; (3) the loop closes itself — analysis drives automatic pump control with farmer-set thresholds, and everything keeps working offline on demo/cached data.

## Operating Context

- Fields with one or two sensor nodes (soil NPK + moisture, temperature, humidity, light, pressure, pH), reached over MQTT with live/offline/demo data sources and 1-tap node switching.
- Devices span small low-end Android phones to desktop browsers; the phone in the field is the design driver.
- Bright outdoor sunlight, dust, gloves, one-thumb use; Hindi is the default language with 9 supported languages.
- Daily rhythm: morning advice check, irrigation decisions, occasional questions to Agri, pump automation running unattended.

## Capabilities and Constraints

Confirmed capabilities: home status overview with Farm Signals; soil / crop / weather / history screens with evidence tables and trends; Agri voice screen (live Gemini conversation, chips, talk log, captions); pump/robot screen with auto/manual modes and threshold controls; text-to-speech summaries on every screen; light/dark/system themes.

Constraints future work must preserve: every existing workflow, route, control, and i18n key; all thresholds and automation logic in `js/agri.js`; touch targets stay ≥ 48px; text contrast must survive direct sunlight (body ≥ 7:1 preferred); reduced-motion preferences must be honored; every control keeps an accessible name; no new network dependencies on the critical path (offline-first).

Undecided: whether the crop picker and node sheet stay as sheets or become part of the new flow; exact icon set to replace/augment emoji.

## Brand Commitments

Name EnviroOS; green farm identity; Agri as a named speaking character; voice-first personality ("ask in your own words"); Plus Jakarta Sans as the display voice (self-hosted, matches the product film). Standing preference (user-chosen, direction round 2026-10-12): the category canon — the familiar clean card dashboard, executed at the combined craft level of Google Weather (glanceable clarity) and JioPhone (ultra-simple large-target usability), with oversized touch targets throughout. Recorded from repository and shipped-film evidence; user has not asked to change them.

## Evidence on Hand

The runnable app itself (`index.html`, `js/`, `css/`), the full i18n dictionary (`js/i18n.js`, 9 languages), real sensor value ranges and analysis logic (`js/agri.js`), and the shipped product films (`enviroos-product.mp4`, `public/video/`). Absent and must not be fabricated: farmer testimonials, field-trial results, yield claims, pricing.

## Product Principles

1. The field speaks first — every screen answers "what should I do?" before it shows a single number.
2. Voice is a control, not an accessory — anything readable must also be askable and hearable.
3. Works where the farmer works — sun, dust, gloves, no signal; the design must survive all four.
4. One thumb, no dead ends — big targets, every tap acknowledges, every screen offers the next step.
5. Truth over decoration — a status says what is true and what to do about it, or it does not ship.

## Accessibility & Inclusion

Voice-led operation for limited-reading users (TTS on all summaries, STT + chips for Agri); sunlight-legible contrast; ≥ 48px touch targets; full keyboard and screen-reader operability preserved through the rebuild; reduced-motion honored; Hindi default with language switching kept within one tap.
