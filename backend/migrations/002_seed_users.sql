WITH seed_users AS (
  SELECT
    i,
    'u' || i::TEXT AS user_id,
    CASE
      WHEN i = 1 THEN 'Alex'
      WHEN i = 2 THEN 'Sam'
      WHEN i = 3 THEN 'Taylor'
      ELSE (
        (ARRAY['Alex','Sam','Taylor','Jordan','Casey','Riley','Morgan','Avery','Jamie','Reese','Skyler','Quinn','Parker','Dakota','Cameron','Rowan','Blake','Finley','Elliot','Hayden'])[((i - 1) % 20) + 1]
        || ' ' || i::TEXT
      )
    END AS name,
    CASE
      WHEN i = 1 THEN 27
      WHEN i = 2 THEN 30
      WHEN i = 3 THEN 26
      ELSE 20 + (i % 15)
    END AS age,
    CASE WHEN i % 2 = 0 THEN 'man' ELSE 'woman' END AS gender,
    CASE WHEN i % 2 = 0 THEN 'woman' ELSE 'man' END AS interested_in,
    (ARRAY['sf-1','sf-2','sf-3','sf-4','ny-1','ny-2','la-1','la-2'])[(((i - 1) / 2)::INT % 8) + 1] AS location_cell,
    (ARRAY[
      'Coffee and city walks',
      'Gym + books + sushi',
      'Always up for hiking',
      'Dog person',
      'Music and late-night drives',
      'Food hunter',
      'Beach weekends',
      'Design lover',
      'Tech and travel',
      'Board games fan'
    ])[((i - 1) % 10) + 1] AS bio,
    CASE
      WHEN i = 1 THEN 'alex@demo.app'
      WHEN i = 2 THEN 'sam@demo.app'
      WHEN i = 3 THEN 'taylor@demo.app'
      ELSE 'user' || i::TEXT || '@demo.app'
    END AS email
  FROM generate_series(1, 100) AS t(i)
)
INSERT INTO profiles (user_id, name, age, gender, interested_in, location_cell, bio)
SELECT user_id, name, age, gender, interested_in, location_cell, bio
FROM seed_users
ON CONFLICT (user_id) DO NOTHING;

WITH seed_users AS (
  SELECT
    i,
    'u' || i::TEXT AS user_id,
    CASE
      WHEN i = 1 THEN 'alex@demo.app'
      WHEN i = 2 THEN 'sam@demo.app'
      WHEN i = 3 THEN 'taylor@demo.app'
      ELSE 'user' || i::TEXT || '@demo.app'
    END AS email
  FROM generate_series(1, 100) AS t(i)
)
INSERT INTO auth_users (user_id, email, password_hash)
SELECT user_id, email, 'd3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791'
FROM seed_users
ON CONFLICT (email) DO NOTHING;
