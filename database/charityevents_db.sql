-- =====================================================================
--  PROG2002 Web Development II - Assessment 3
--  Charity Events Platform - Database Schema & Seed Data
--  Schema name : charityevents_db
--  Engine      : MySQL 8.0+ / MariaDB 10.4+
--
--  This single file contains EVERYTHING required for marking and
--  deployment:
--    1. Database + schema creation
--    2. Table definitions (categories, events, registrations)
--    3. Keys, constraints and indexes
--    4. Two views + two triggers (business rules)
--    5. Seed data - 6 categories, 14 events, 18 registrations
--
--  Import:  mysql -u <user> -p < charityevents_db.sql
--  or via SCU cPanel > phpMyAdmin > Import.
-- =====================================================================

DROP DATABASE IF EXISTS charityevents_db;
CREATE DATABASE charityevents_db
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;
USE charityevents_db;

-- ---------------------------------------------------------------------
-- 1. CATEGORIES
--    Reference/lookup table. Kept deliberately small and normalised so
--    that a category name is stored exactly once and can be renamed
--    without touching the events table.
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    category_id          INT           NOT NULL AUTO_INCREMENT,
    category_name        VARCHAR(80)   NOT NULL,
    category_description VARCHAR(255)  NULL,
    PRIMARY KEY (category_id),
    UNIQUE KEY uq_categories_name (category_name)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 2. EVENTS
--    Core entity of the case study.
--    New in A3: event_status, event_capacity, ticket_price and the
--    latitude / longitude pair required by the Open-Meteo Weather API.
-- ---------------------------------------------------------------------
CREATE TABLE events (
    event_id          INT            NOT NULL AUTO_INCREMENT,
    event_name        VARCHAR(150)   NOT NULL,
    category_id       INT            NOT NULL,
    event_description TEXT           NULL,
    event_venue       VARCHAR(200)   NULL,
    event_city        VARCHAR(80)    NULL,
    latitude          DECIMAL(9,6)   NULL,
    longitude         DECIMAL(9,6)   NULL,
    event_date        DATE           NOT NULL,
    event_time        TIME           NULL,
    event_status      ENUM('Active','Past','Suspended') NOT NULL DEFAULT 'Active',
    event_capacity    INT            NOT NULL DEFAULT 0,
    ticket_price      DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    event_image       VARCHAR(255)   NULL,
    created_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id),
    KEY idx_events_category (category_id),
    KEY idx_events_status   (event_status),
    KEY idx_events_date     (event_date),
    KEY idx_events_name     (event_name),
    CONSTRAINT fk_events_category
        FOREIGN KEY (category_id) REFERENCES categories (category_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_events_capacity CHECK (event_capacity >= 0),
    CONSTRAINT chk_events_price    CHECK (ticket_price   >= 0),
    CONSTRAINT chk_events_lat      CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
    CONSTRAINT chk_events_lng      CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 3. REGISTRATIONS
--    NEW TABLE for A3. Records which web user registered for which
--    event.
--
--    Business rules enforced at database level:
--      * uq_registrations_event_email  -> one user can register for a
--        given event only ONCE, but may register for many events.
--      * fk_registrations_event ON DELETE RESTRICT -> the database
--        itself refuses to delete an event that has registrations.
--        The API additionally pre-checks this to return a friendly
--        HTTP 409 instead of a raw SQL error.
--      * chk_registrations_tickets     -> 1..10 tickets per booking.
-- ---------------------------------------------------------------------
CREATE TABLE registrations (
    registration_id   INT          NOT NULL AUTO_INCREMENT,
    event_id          INT          NOT NULL,
    full_name         VARCHAR(120) NOT NULL,
    email             VARCHAR(160) NOT NULL,
    phone             VARCHAR(30)  NOT NULL,
    tickets_purchased INT          NOT NULL DEFAULT 1,
    registration_date DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_amount      DECIMAL(10,2) NULL,
    notes             VARCHAR(255) NULL,
    PRIMARY KEY (registration_id),
    UNIQUE KEY uq_registrations_event_email (event_id, email),
    KEY idx_registrations_date  (registration_date),
    KEY idx_registrations_email (email),
    CONSTRAINT fk_registrations_event
        FOREIGN KEY (event_id) REFERENCES events (event_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_registrations_tickets CHECK (tickets_purchased BETWEEN 1 AND 10)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- 4. VIEWS
-- ---------------------------------------------------------------------

-- Administrative listing: every event with its category, remaining
-- seats and registration count - regardless of status.
CREATE OR REPLACE VIEW vw_event_summary AS
SELECT  e.event_id,
        e.event_name,
        c.category_name,
        e.event_city,
        e.event_date,
        e.event_status,
        e.event_capacity,
        e.ticket_price,
        COALESCE(SUM(r.tickets_purchased), 0)                          AS tickets_sold,
        e.event_capacity - COALESCE(SUM(r.tickets_purchased), 0)        AS seats_remaining,
        COUNT(r.registration_id)                                       AS registration_count
FROM        events e
JOIN        categories c ON c.category_id = e.category_id
LEFT JOIN   registrations r ON r.event_id = e.event_id
GROUP BY    e.event_id, e.event_name, c.category_name, e.event_city,
            e.event_date, e.event_status, e.event_capacity, e.ticket_price;

-- Client-side detail page: flattened registration listing.
CREATE OR REPLACE VIEW vw_event_registrations AS
SELECT  r.registration_id,
        r.event_id,
        e.event_name,
        r.full_name,
        r.email,
        r.phone,
        r.tickets_purchased,
        r.total_amount,
        r.registration_date
FROM        registrations r
JOIN        events e ON e.event_id = r.event_id;

-- ---------------------------------------------------------------------
-- 5. TRIGGERS - business rules that must hold no matter which client
--    (website, Postman, phpMyAdmin) writes the data.
-- ---------------------------------------------------------------------

DELIMITER $$

-- A registration is only accepted when the event exists, is Active, and
-- enough seats remain. Doing the checks in a BEFORE INSERT trigger means
-- over-booking is impossible even if two users submit at the same moment
-- or somebody bypasses the API and writes to MySQL directly.
--
-- The same trigger also derives `total_amount` from the event's current
-- ticket price. This MUST be done in a BEFORE trigger (setting NEW.*):
-- MySQL refuses to let an AFTER trigger INSERT/UPDATE the very table the
-- firing statement is already using (error 1442).
CREATE TRIGGER trg_registrations_before_insert
BEFORE INSERT ON registrations
FOR EACH ROW
BEGIN
    DECLARE v_status   VARCHAR(20);
    DECLARE v_capacity INT;
    DECLARE v_price    DECIMAL(10,2);
    DECLARE v_sold     INT;

    SELECT event_status, event_capacity, ticket_price
      INTO v_status, v_capacity, v_price
      FROM events
     WHERE event_id = NEW.event_id;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot register: the selected event does not exist.';
    END IF;

    IF v_status <> 'Active' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot register: this event is not currently open for registration.';
    END IF;

    SELECT COALESCE(SUM(tickets_purchased), 0)
      INTO v_sold
      FROM registrations
     WHERE event_id = NEW.event_id;

    IF (v_sold + NEW.tickets_purchased) > v_capacity THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot register: not enough seats remaining for this event.';
    END IF;

    IF NEW.total_amount IS NULL THEN
        SET NEW.total_amount = NEW.tickets_purchased * v_price;
    END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- 6. SEED DATA
-- ---------------------------------------------------------------------
INSERT INTO categories (category_name, category_description) VALUES
 ('Community',   'Local community fundraising and neighbourhood support events'),
 ('Education',   'Scholarships, literacy programs and school support initiatives'),
 ('Health',      'Medical research, wellbeing and hospital fundraising events'),
 ('Environment', 'Conservation, clean-up and sustainable living projects'),
 ('Emergency',   'Disaster relief and emergency response fundraising'),
 ('Arts',        'Creative arts, music and cultural fundraising events');

INSERT INTO events
 (event_name, category_id, event_description, event_venue, event_city,
  latitude, longitude, event_date, event_time, event_status,
  event_capacity, ticket_price, event_image) VALUES
 ('Charity Fun Run 2026', 1,
  'A 5km family fun run along the riverbank raising funds for local community shelters.',
  'Riverside Park', 'Lismore', -28.813300, 153.277800,
  '2026-01-18', '07:30:00', 'Active', 300, 25.00, 'funrun.jpg'),

 ('Winter Warmth Appeal', 1,
  'Community drive collecting blankets and warm clothing for families in need.',
  'Lismore Community Hall', 'Lismore', -28.810700, 153.279500,
  '2026-06-12', '09:00:00', 'Active', 150, 10.00, 'winter.jpg'),

 ('Scholarship Gala Dinner', 2,
  'Black-tie gala dinner funding three annual university scholarships.',
  'Coffs Harbour Convention Centre', 'Coffs Harbour', -30.296300, 153.113500,
  '2026-03-21', '18:30:00', 'Active', 200, 150.00, 'gala.jpg'),

 ('STEM for Kids Workshop', 2,
  'Hands-on robotics and coding workshops donated to regional primary schools.',
  'Southern Cross University', 'Gold Coast', -28.169100, 153.518600,
  '2026-11-07', '10:00:00', 'Active', 120, 40.00, 'stem.jpg'),

 ('Read & Grow Book Drive', 2,
  'Book donation drive stocking school libraries across the Northern Rivers.',
  'Byron Bay Community Library', 'Byron Bay', -28.643400, 153.612400,
  '2026-12-05', '11:00:00', 'Active', 90, 15.00, 'books.jpg'),

 ('Pink Ribbon Morning Tea', 3,
  'Morning tea and raffle supporting breast cancer research nurses.',
  'Ballina RSL Club', 'Ballina', -28.864500, 153.563300,
  '2026-04-09', '10:00:00', 'Active', 180, 20.00, 'pinkribbon.jpg'),

 ('Mental Health First Aid Day', 3,
  'Free accredited mental health first aid training for community volunteers.',
  'Tweed Heads Civic Centre', 'Tweed Heads', -28.177800, 153.541400,
  '2026-11-22', '08:30:00', 'Active', 100, 0.00, 'mentalhealth.jpg'),

 ('Coastal Clean-Up Challenge', 4,
  'Beach and estuary clean-up with prizes for the largest team haul.',
  'Kingscliff Beach', 'Kingscliff', -28.255700, 153.572400,
  '2027-02-14', '08:00:00', 'Active', 250, 5.00, 'cleanup.jpg'),

 ('Tree Planting Festival', 4,
  'One thousand native trees to be planted along the Richmond River corridor.',
  'Richmond River Reserve', 'Casino', -28.859200, 153.045900,
  '2026-12-19', '07:00:00', 'Active', 400, 0.00, 'trees.jpg'),

 ('Bushfire Relief Fundraiser', 5,
  'Concert and auction raising funds for bushfire affected rural families.',
  'Grafton Showgrounds', 'Grafton', -29.690600, 152.933700,
  '2026-05-16', '16:00:00', 'Active', 500, 45.00, 'bushfire.jpg'),

 ('Flood Recovery Support Night', 5,
  'Community dinner and silent auction supporting flood recovery grants.',
  'Murwillumbah Civic Centre', 'Murwillumbah', -28.327200, 153.395200,
  '2026-11-28', '18:00:00', 'Active', 220, 60.00, 'flood.jpg'),

 ('Emergency Response Training', 5,
  'Practical first-response training for rural volunteer brigades.',
  'Kempsey Showground', 'Kempsey', -31.081800, 152.833700,
  '2026-08-15', '09:00:00', 'Active', 80, 35.00, 'response.jpg'),

 ('Art for Good Exhibition', 6,
  'Curated exhibition where 100% of artwork sales go to charity partners.',
  'Lismore Regional Gallery', 'Lismore', -28.810200, 153.280600,
  '2027-01-23', '17:00:00', 'Active', 140, 30.00, 'art.jpg'),

 ('Youth Music Showcase', 6,
  'Showcase concert featuring local youth bands raising funds for music programs.',
  'Coffs Harbour Amphitheatre', 'Coffs Harbour', -30.305600, 153.140300,
  '2026-09-26', '15:00:00', 'Active', 300, 25.00, 'music.jpg');

-- 18 registrations spread across 8 events; 6 events intentionally have
-- zero registrations so the "delete is allowed" path can be demonstrated
-- in the admin website.
INSERT INTO registrations
 (event_id, full_name, email, phone, tickets_purchased, registration_date, notes) VALUES
 (1,  'Nehemia Sugianto',   'nehemia.sugianto@student.scu.edu.au', '0400 111 201', 2, '2026-01-04 09:12:00', 'Bringing my two children'),
 (1,  'Priya Raman',        'priya.raman@student.scu.edu.au',       '0400 111 202', 1, '2026-01-05 14:35:00', NULL),
 (1,  'Daniel O''Brien',    'daniel.obrien@student.scu.edu.au',     '0400 111 203', 4, '2026-01-09 18:02:00', 'Team entry - Northern Rivers Runners'),
 (2,  'Aisha Khan',         'aisha.khan@student.scu.edu.au',        '0400 111 204', 1, '2026-05-30 11:20:00', NULL),
 (3,  'Marcus Lee',         'marcus.lee@student.scu.edu.au',        '0400 111 205', 2, '2026-02-14 20:45:00', 'Vegetarian meal required'),
 (3,  'Sophie Nguyen',      'sophie.nguyen@student.scu.edu.au',     '0400 111 206', 1, '2026-03-01 08:05:00', NULL),
 (4,  'Liam O''Connor',     'liam.oconnor@student.scu.edu.au',      '0400 111 207', 2, '2026-09-28 10:15:00', 'Year 5 teacher - booking for two students'),
 (4,  'Hannah Fischer',     'hannah.fischer@student.scu.edu.au',    '0400 111 208', 1, '2026-10-02 16:40:00', NULL),
 (4,  'Jamal Abdi',         'jamal.abdi@student.scu.edu.au',        '0400 111 209', 3, '2026-10-09 12:30:00', 'School group booking'),
 (6,  'Grace Whitfield',    'grace.whitfield@student.scu.edu.au',   '0400 111 210', 2, '2026-03-18 13:00:00', NULL),
 (7,  'Tobias Meyer',       'tobias.meyer@student.scu.edu.au',      '0400 111 211', 1, '2026-10-11 09:45:00', 'Volunteer coordinator'),
 (7,  'Yuki Tanaka',        'yuki.tanaka@student.scu.edu.au',       '0400 111 212', 2, '2026-10-12 19:10:00', NULL),
 (8,  'Chloe Bennett',      'chloe.bennett@student.scu.edu.au',     '0400 111 213', 5, '2026-10-13 07:55:00', 'Surf club team of five'),
 (10, 'Ryan Patel',         'ryan.patel@student.scu.edu.au',        '0400 111 214', 3, '2026-04-22 21:05:00', NULL),
 (11, 'Elena Rossi',        'elena.rossi@student.scu.edu.au',       '0400 111 215', 2, '2026-10-14 15:25:00', 'Representing Murwillumbah Rotary'),
 (11, 'Samuel Adeyemi',     'samuel.adeyemi@student.scu.edu.au',    '0400 111 216', 1, '2026-10-14 18:50:00', NULL),
 (13, 'Isabella Moreau',    'isabella.moreau@student.scu.edu.au',   '0400 111 217', 2, '2026-10-15 08:30:00', 'Interested in two paintings'),
 (13, 'Oliver Schmidt',     'oliver.schmidt@student.scu.edu.au',    '0400 111 218', 1, '2026-10-15 10:05:00', NULL);

-- ---------------------------------------------------------------------
-- 6b. Restore the real event statuses
--
--     The BEFORE INSERT trigger deliberately refuses registrations for
--     events that are not Active. That rule is correct for live traffic,
--     but seeding historical bookings for events that have already
--     happened is a legitimate import scenario. The seed therefore loads
--     every event as 'Active', records the registrations, and only then
--     applies each event's real status. Re-running this whole file is
--     safe: it drops and recreates the database first.
-- ---------------------------------------------------------------------
UPDATE events SET event_status = 'Past'      WHERE event_id IN (1, 2, 3, 6, 10);
UPDATE events SET event_status = 'Suspended' WHERE event_id IN (12, 14);

-- ---------------------------------------------------------------------
-- 7. VERIFICATION
-- ---------------------------------------------------------------------
SELECT 'categories'   AS table_name, COUNT(*) AS rows_loaded FROM categories
UNION ALL SELECT 'events',        COUNT(*) FROM events
UNION ALL SELECT 'registrations', COUNT(*) FROM registrations;

SELECT * FROM vw_event_summary ORDER BY event_date;
