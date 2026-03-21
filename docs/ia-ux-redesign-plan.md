# NewKanban IA/UX Redesign Plan

## Objective

NewKanban should stop behaving like a broad multi-view workspace demo and start behaving like a daily collaboration operating system.

The target position is:

- fast enough for individual execution like Linear
- structured enough for planning like Asana
- collaborative enough for async alignment like Notion + Slack
- visual enough for workshops and decision capture like Miro

The current repo already has strong building blocks:

- auth, roles, MFA, audit, invites
- realtime workspace sync
- Kanban, Gantt, Calendar, Whiteboard
- task, event, note, notification, workspace membership models

The redesign should not add more top-level surfaces first. It should reorganize the existing ones around a smaller number of primary workflows.

## Current Product Diagnosis

The current shell exposes five equal-weight views from the left nav: [src/components/workspace/config.ts](/Users/doggy/2026/NewKanban/src/components/workspace/config.ts).

That creates three product problems:

1. There is no dominant daily starting point.
2. Important actions are hidden inside popovers and dialogs.
3. The domain model is too shallow for serious operating workflows.

Concrete symptoms in the current code:

- Search says it covers `tasks, notes, members` but only filters task fields: [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L983), [src/components/workspace/task-utils.ts](/Users/doggy/2026/NewKanban/src/components/workspace/task-utils.ts)
- Notifications are a dropdown instead of an inbox/triage surface: [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L991)
- Overview cards are not reliable enough to be an operating hub: [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L396)
- Whiteboard view only exposes the freeform canvas, while structured decision note infrastructure exists separately: [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx#L774), [src/components/workspace/surfaces.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/surfaces.tsx#L258), [server.mjs](/Users/doggy/2026/NewKanban/server.mjs#L907)
- Presence is visually thin and modeled too coarsely for richer collaboration cues: [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L975), [server.mjs](/Users/doggy/2026/NewKanban/server.mjs#L379)

## Product Spine

The recommended product spine is:

`Capture -> Triage -> Execute -> Review -> Schedule -> Decide`

This is a better fit than a pure whiteboard-first tool because the current repo is already strongest in task/event/auth/admin flows.

That means:

- tasks become the primary execution object
- projects become the planning container above tasks
- inbox becomes the triage layer for notifications, mentions, requests, and follow-ups
- whiteboard becomes a decision/collaboration tool, not an isolated fifth tab
- calendar and gantt become planning views of projects and tasks, not equal-weight destinations

## Target Information Architecture

### Desktop IA

Primary navigation:

- Home
- Inbox
- My Work
- Projects
- Calendar
- Collaborate

Secondary navigation inside a workspace:

- current workspace switcher
- search / command palette
- quick create
- profile / admin

Contextual tabs by destination:

- Home: Overview, Activity, Risk, Team Load
- Projects: Board, Timeline, List, Files
- Calendar: Month, Week, Day
- Collaborate: Canvas, Decisions, Notes

### Mobile IA

Bottom nav:

- Home
- Inbox
- My Work
- Projects
- More

`More` contains:

- Calendar
- Collaborate
- Workspace switcher
- Members
- Settings

This replaces the current `lg`-only sidebar dependency in [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L924).

## Surface Redesign

### 1. Home

Purpose:

- single daily operating surface for the team
- the first screen after login

Top section:

- workspace health summary
- on-track / at-risk projects
- review queue
- upcoming deadlines

Main body:

- `Needs attention`
- `Today`
- `Blocked`
- `Recent decisions`
- `Upcoming schedule`

Right rail on desktop:

- active collaborators
- recent activity
- quick filters

Changes vs current Overview:

- stop showing generic metrics first
- lead with actionable queues, not vanity counts
- use durable links into task/project/decision detail

Current files to change first:

- [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx#L172)
- [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L394)

### 2. Inbox

Purpose:

- triage mentions, join requests, approvals, direct messages, automation follow-ups, and review-required items

Replace current notification dropdown with a real page:

- All
- Assigned to me
- Mentions
- Requests
- System

Each row should include:

- actor
- object
- reason
- timestamp
- next action

Primary actions:

- open task
- approve / reject
- snooze
- mark done
- assign to me

Current gaps this fixes:

- dropdown-only notifications in [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L991)
- shallow notification types in [src/lib/types.ts](/Users/doggy/2026/NewKanban/src/lib/types.ts#L5)

### 3. My Work

Purpose:

- personal execution view

Sections:

- Focus now
- Due today
- Waiting for review
- Blocked by others
- Recently updated

Rules:

- strictly user-scoped
- keyboard-first
- optimized for fast status changes and comment reply

This gives NewKanban the missing “daily personal cockpit” that strong execution tools have.

### 4. Projects

Purpose:

- planning and team execution surface

Target structure:

- project list on the left
- active project summary on top
- board/timeline/list tabs in content area

New first-class object:

- `Project`

Recommended fields:

- id
- name
- description
- status
- ownerUserId
- targetStartDate
- targetEndDate
- health
- linkedGoalId
- taskIds

Task should gain:

- projectId
- reviewState
- subscriberUserIds
- lastActorUserId

Why this matters:

- today the app has tasks but no durable planning container above them
- gantt and kanban are therefore task-only surfaces instead of project operating views

Current files implicated:

- [src/lib/types.ts](/Users/doggy/2026/NewKanban/src/lib/types.ts#L57)
- [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx#L362)
- [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx#L432)

### 5. Calendar

Purpose:

- commitment and coordination layer

Redesign principles:

- combine task deadlines and events in one time model
- show workload and review load, not only event blocks
- make linked task context visible without opening a modal

Layout:

- top bar with date controls and workload chips
- main grid
- side panel with selected day items grouped by tasks, events, reviews

Current calendar is already reasonably strong functionally. The main redesign need is information hierarchy, not raw capability: [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx#L598).

### 6. Collaborate

Purpose:

- unify whiteboard, decisions, and structured notes

This should replace the current isolated `Whiteboard` mental model.

Subtabs:

- Canvas
- Decisions
- Notes

Recommended behavior:

- a decision can be captured from canvas selection
- a note can convert into a task without leaving the screen
- decisions show owner, due date, linked project, linked task
- presence shows who is viewing or editing the same board

Current split to resolve:

- freeform canvas in [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx#L774)
- note dialog and structured decision fields in [src/components/workspace/surfaces.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/surfaces.tsx#L258)
- note mutation flows in [server.mjs](/Users/doggy/2026/NewKanban/server.mjs#L907)

## Navigation Model

### Header

Keep:

- workspace switcher
- search / command palette
- collaborator presence
- profile

Change:

- replace search popover with always-available command bar trigger
- replace notification bell dropdown with Inbox destination
- add visible `Create` button for task / event / note / project

### Command Palette

Add a universal command palette with:

- go to page
- open project
- open task
- create task
- create event
- create decision
- switch workspace

This is a higher-leverage improvement than adding more top-level UI chrome.

## Interaction Principles

### Task Detail

Move away from “big edit form” and toward “action sheet + detail”.

Recommended structure:

- header: title, project, assignee, due, status
- body tabs: Updates, Subtasks, Files, Links
- right rail on desktop: properties and linked schedule

Make inline quick actions prominent:

- assign
- move state
- request review
- link event
- mark blocked

Current issue reference: [src/components/workspace/surfaces.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/surfaces.tsx#L185)

### Kanban Card

Reduce interaction density.

Card surface should show:

- title
- assignee
- due
- priority
- comment / attachment counts
- blocked state

Do not keep these as always-visible controls on the card:

- progress slider
- due date input field
- multiple action buttons

Move those into detail or row actions.

Current issue reference: [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx#L316)

### Presence

Upgrade presence from “avatars in the header” to contextual collaboration cues.

Target states:

- viewing same task
- editing same task
- viewing same board
- editing same canvas
- typing comment

This requires preserving per-device state instead of deduping by user as done now in [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx#L268).

## Visual Direction

The current UI is polished but too uniform.

Keep:

- clean blue identity
- generous radius
- soft surfaces

Change:

- differentiate destination types visually
- reserve glass treatment for shell and elevated surfaces
- use denser, flatter surfaces for task-heavy areas
- use stronger color semantics for risk, review, approvals, focus

Visual tone by destination:

- Home: calm, summary-first
- Inbox: dense, operational, low-decoration
- My Work: focused, compact, scannable
- Projects: structured and status-rich
- Collaborate: more spatial and expressive

## Domain Model Changes

Recommended new first-class entities:

- Project
- InboxItem
- Decision

Recommended model upgrades:

- `ActivityItem` should include entity id, not only title: [src/lib/types.ts](/Users/doggy/2026/NewKanban/src/lib/types.ts#L133)
- `NotificationType` should expand beyond three cases: [src/lib/types.ts](/Users/doggy/2026/NewKanban/src/lib/types.ts#L5)
- `PresenceMember` should support object-level presence and session-level identity: [src/lib/types.ts](/Users/doggy/2026/NewKanban/src/lib/types.ts#L196)
- `TaskItem` should be project-aware and review-aware: [src/lib/types.ts](/Users/doggy/2026/NewKanban/src/lib/types.ts#L57)

## Rollout Plan

### Phase 1: IA correction without major data migration

Goals:

- make the product easier to understand immediately
- remove dead-end interactions

Changes:

- add Home / Inbox / My Work top-level destinations
- move notifications to Inbox page
- add mobile navigation
- add global create action
- tighten Overview into action-first Home
- remove or hide undifferentiated dormant entry points until surfaced properly

Primary files:

- [src/components/workspace/config.ts](/Users/doggy/2026/NewKanban/src/components/workspace/config.ts)
- [src/components/workspace/workspace-app.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/workspace-app.tsx)
- [src/components/workspace/views.tsx](/Users/doggy/2026/NewKanban/src/components/workspace/views.tsx)

### Phase 2: workflow depth

Goals:

- create stronger daily-use loops

Changes:

- implement Inbox page
- implement My Work page
- redesign task detail
- simplify Kanban cards
- unify whiteboard + decisions under Collaborate

### Phase 3: model upgrade

Goals:

- make planning and collaboration durable

Changes:

- add Project entity
- add Decision entity
- upgrade activity and notification models
- preserve session-level presence

Primary files:

- [src/lib/types.ts](/Users/doggy/2026/NewKanban/src/lib/types.ts)
- [server.mjs](/Users/doggy/2026/NewKanban/server.mjs)

### Phase 4: reliability and trust

Goals:

- match the expectations of serious team use

Changes:

- visible mutation error states
- retry and rollback behavior
- stronger automated verification for multi-client flows
- browser tests for drag/drop and task detail flows

## Success Metrics

Product metrics:

- daily active users opening Home or My Work first
- inbox clear rate
- review turnaround time
- blocked task resolution time
- decision-to-task conversion rate

UX metrics:

- time to open and update a task
- time to find a task from global search
- percentage of mobile sessions reaching a second destination
- task detail completion without modal abandonment

## Recommended Immediate Work Queue

If implementation starts now, the highest-value order is:

1. Add new navigation model and mobile nav shell
2. Convert current Overview into Home
3. Implement Inbox as a full page
4. Implement My Work as a full page
5. Redesign task detail and simplify card surfaces
6. Merge Whiteboard + Decision Notes into Collaborate
7. Introduce Project in the domain model

## Decision

Do not add more top-level tools yet.

First make the product legible:

- one clear starting point
- one clear triage surface
- one clear personal execution surface
- one clear planning surface
- one clear collaboration surface

That is the shortest path from “feature-rich demo” to “best-in-class collaboration product candidate”.
