---
id: "001"
from: berenger
date: 2024-01-12
status: active
risk: low
tags: [feature, ux, api]
files:
  - src/components/RepoSelector.tsx
  - src/App.tsx
---

# Smart Branch Discovery

## Summary
Auto-discovery of git branches with intent detection when loading a repository. Shows quick suggestions for branches that are ahead of the default branch, with badges indicating how many intents each branch contains.

## Motivation
Previously, users had to manually type branch names to compare. This feature automatically detects interesting branches and surfaces them as quick suggestions, prioritizing branches with intents. This reduces friction when reviewing code and helps developers quickly find branches that have documentation.

## Chunks

### @function:loadBranchDiscovery | Auto-discovery trigger in RepoSelector

This function is called automatically when a git repository is selected in the folder browser. It makes an API call to `/api/discover-branches` which returns:
- All local branches with their last commit info
- Ahead/behind counts relative to the default branch (main/master)
- Intent detection: checks if each branch has a `.intent/manifest.yaml` file
- Suggested comparisons for branches that are ahead of default

The function populates the branch dropdown and shows quick suggestion chips for active branches.

> Decision: Trigger discovery on isGitRepo + currentPath change to ensure we always have fresh data
> Decision: Show loading spinner during discovery to indicate background work

### @function:RepoSelector | Enhanced UI with branch suggestions

The RepoSelector component was extended with several UI improvements:
- **Quick Compare section**: Clickable chips showing suggested branch comparisons
- **Intent badges**: Green badges showing the number of intents in each branch
- **Branch dropdown**: Replaces text input with a dropdown showing all branches with metadata
- **Ahead/behind indicators**: Shows how many commits a branch is ahead/behind the default

The component supports both local repositories (via folder browser) and GitHub URLs (via text input). For GitHub, it auto-detects whether the URL is a PR or a repository.

> Decision: Show suggestions only for branches ahead of default (active work) - branches behind are usually stale
> Decision: Intent badge appears only when branch has intents to avoid visual noise
> Decision: Sort branches by last commit date (most recent first)

### @function:loadFromGitHubBranches | GitHub branch comparison handler

Enables comparing any two branches on a GitHub repository, not just PRs. This function:
1. Parses the GitHub URL to extract owner/repo
2. Calls the GitHub API to discover available branches
3. Fetches the diff between selected base and head branches
4. Attempts to load intents from the `.intent/` directory on the head branch

The function handles several edge cases:
- Rate limiting from GitHub API (shows appropriate error)
- Missing intent files (gracefully falls back to no intents)
- Invalid branch names (validation before API call)

> Decision: Limit to 20 branches to avoid GitHub API rate limits - most repos don't need more
> Decision: Fall back gracefully when intents cannot be loaded from remote - don't block the diff view
> Decision: Cache branch list for 5 minutes to reduce API calls

