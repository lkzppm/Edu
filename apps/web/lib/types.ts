export type Conn = {
  id: number;
  name: string;
  connected: boolean;
  institution: string | null;
  display_name: string | null;
  base_url: string | null;
  sync_status: string;
  last_sync_at: string | null;
  last_error: string | null;
  courses: number;
  tasks_pending: number;
  demo: boolean;
};

export type ConnectorsResponse = {
  classroom_credentials_present: boolean;
  connectors: Conn[];
};

export type Course = {
  id: number;
  account_id: number;
  connector: string;
  name: string;
  code: string | null;
  url: string | null;
  hidden: boolean;
  pending: number;
};

export type Task = {
  id: number;
  course_id: number | null;
  course_name: string | null;
  course_code: string | null;
  connector: string | null;
  kind: string;
  title: string;
  description: string;
  url: string | null;
  due_at: string | null;
  source_status: string | null;
  grade: string | null;
  max_grade: string | null;
  status: string;
  completed_at: string | null;
};

export type GradeItem = {
  name: string;
  grade: string | null;
  max_grade: string | null;
  pct: number | null;
  graded_at: string | null;
  url: string | null;
};

export type CourseGrades = {
  course_id: number;
  course_name: string;
  course_code: string | null;
  connector: string;
  total: GradeItem | null;
  items: GradeItem[];
};

export type GradesResponse = {
  courses: CourseGrades[];
};

export type TasksResponse = {
  summary: { overdue: number; due_today: number; due_week: number; done_week: number };
  tasks: Task[];
};
