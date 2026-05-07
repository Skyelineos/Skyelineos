-- Migration: Add foreign key constraints for task dependencies and project relationships
-- Created: 2024-01-05
-- Description: Ensure data integrity between tasks, dependencies, and projects

-- 1. Add foreign key constraint from project_tasks to projects (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'project_tasks_project_id_fkey'
        AND table_name = 'project_tasks'
    ) THEN
        ALTER TABLE project_tasks 
        ADD CONSTRAINT project_tasks_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Add foreign key constraints for task_dependencies (if not exists)
DO $$
BEGIN
    -- Foreign key to projects
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'task_dependencies_project_id_fkey'
        AND table_name = 'task_dependencies'
    ) THEN
        ALTER TABLE task_dependencies 
        ADD CONSTRAINT task_dependencies_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    -- Foreign key to from_task_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'task_dependencies_from_task_id_fkey'
        AND table_name = 'task_dependencies'
    ) THEN
        ALTER TABLE task_dependencies 
        ADD CONSTRAINT task_dependencies_from_task_id_fkey 
        FOREIGN KEY (from_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE;
    END IF;

    -- Foreign key to to_task_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'task_dependencies_to_task_id_fkey'
        AND table_name = 'task_dependencies'
    ) THEN
        ALTER TABLE task_dependencies 
        ADD CONSTRAINT task_dependencies_to_task_id_fkey 
        FOREIGN KEY (to_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Add unique constraint to prevent duplicate dependencies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'task_dependencies_unique_pair'
        AND table_name = 'task_dependencies'
    ) THEN
        ALTER TABLE task_dependencies 
        ADD CONSTRAINT task_dependencies_unique_pair 
        UNIQUE (from_task_id, to_task_id);
    END IF;
END $$;

-- 4. Add check constraint to prevent self-dependencies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'task_dependencies_no_self_dependency'
    ) THEN
        ALTER TABLE task_dependencies 
        ADD CONSTRAINT task_dependencies_no_self_dependency 
        CHECK (from_task_id != to_task_id);
    END IF;
END $$;

-- 5. Create indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_dependencies_project_id 
ON task_dependencies(project_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_dependencies_from_task_id 
ON task_dependencies(from_task_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_dependencies_to_task_id 
ON task_dependencies(to_task_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_tasks_project_id 
ON project_tasks(project_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_tasks_start_date 
ON project_tasks(start_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_tasks_end_date 
ON project_tasks(end_date);

-- Add comments for documentation
COMMENT ON CONSTRAINT project_tasks_project_id_fkey ON project_tasks 
IS 'Ensures tasks belong to valid projects';

COMMENT ON CONSTRAINT task_dependencies_project_id_fkey ON task_dependencies 
IS 'Ensures dependencies belong to valid projects';

COMMENT ON CONSTRAINT task_dependencies_from_task_id_fkey ON task_dependencies 
IS 'Ensures source task exists';

COMMENT ON CONSTRAINT task_dependencies_to_task_id_fkey ON task_dependencies 
IS 'Ensures target task exists';

COMMENT ON CONSTRAINT task_dependencies_unique_pair ON task_dependencies 
IS 'Prevents duplicate dependencies between same tasks';

COMMENT ON CONSTRAINT task_dependencies_no_self_dependency ON task_dependencies 
IS 'Prevents tasks from depending on themselves';