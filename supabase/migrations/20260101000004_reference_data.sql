-- ============================================================================
-- CertiPass — reference data (safe to re-run)
-- ============================================================================

insert into public.departments (code, name) values
  ('CSE',  'Computer Science and Engineering'),
  ('IT',   'Information Technology'),
  ('ECE',  'Electronics and Communication Engineering'),
  ('EEE',  'Electrical and Electronics Engineering'),
  ('MECH', 'Mechanical Engineering'),
  ('CIVIL','Civil Engineering'),
  ('AIDS', 'Artificial Intelligence and Data Science'),
  ('CSBS', 'Computer Science and Business Systems')
on conflict (code) do nothing;

insert into public.event_categories (slug, name, description, sort_order) values
  ('hackathon',          'Hackathon',          'Time-boxed build events and ideathons',              10),
  ('workshop',           'Workshop',           'Hands-on training sessions and bootcamps',           20),
  ('symposium',          'Symposium',          'Inter-college technical and cultural symposiums',    30),
  ('internship',         'Internship',         'Industry or research internships',                   40),
  ('conference',         'Conference',         'Conference attendance and talks',                    50),
  ('competition',        'Competition',        'Contests, quizzes, sports and design challenges',    60),
  ('paper-presentation', 'Paper Presentation', 'Technical paper and poster presentations',           70),
  ('certification',      'Certification',      'Online or professional course certifications',       80),
  ('club-activity',      'Club Activity',      'Student chapters, clubs and volunteering',           90),
  ('other',              'Other',              'Anything that does not fit the categories above',   100)
on conflict (slug) do nothing;

insert into public.app_settings (key, value) values
  ('institution_name',           to_jsonb('Your College'::text)),
  ('student_email_domain',       to_jsonb(''::text)),
  ('allow_student_registration', to_jsonb(true)),
  ('verification_prefix',        to_jsonb('CP'::text))
on conflict (key) do nothing;
