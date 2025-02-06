# PLAN.md

## Resolved Clarifications

1. **Placeholder Video Thumbnails**:
   - We will use static placeholder images with a play icon overlay.

2. **Scrolling Behavior**:
   - The Explore page will implement infinite scrolling and mimic TikTok's swipe gesture for navigation.

3. **Backend Integration**:
   - The backend will serve dynamic, mock video data (simulated dynamic content) with no real-time update requirements.

4. **Front-End Layout and Components (Blazor)**:
   - The Explore page will consist of a header (optional), a video list container, and individual VideoCard components to display video thumbnails with a play icon.
   - We will break this down into:
     - A main Explore page built as a Blazor component (Explore.razor).
     - A VideoCard component (VideoCard.razor) that renders each thumbnail.
     - Optionally, a state management solution (using Blazor's built-in state techniques, e.g., cascading parameters or a state container) if needed.

5. **Additional Functional Details**:
   - The design will be mobile-first, with enhancements for desktop later. Performance and speed are top priorities, so the implementation should be as minimal and efficient as possible.

---

## 2. Preliminary GitHub Issue (Draft)

```md
## **Feature Description**
Implement an Explore page with a TikTok-like video browsing experience featuring placeholder video thumbnails.

### **User Story**
As a mobile user, I want to swipe through an infinite feed of video thumbnails, so that I can quickly browse video content with an engaging, TikTok-inspired UI.

### **Requirements**
**Functional:**
- [ ] Display a list of video thumbnails using static placeholder images with a play icon overlay.
- [ ] Implement infinite scrolling with swipe gesture interactions to mimic TikTok's navigation.
- [ ] Serve mock dynamic video data via a backend API endpoint.

**Non-Functional:**
- [ ] Design must be mobile-first with high performance and quick load times.
- [ ] Follow a vertical slice, feature-sliced design with minimal dependencies.

### **Acceptance Criteria**
- [ ] The Explore page loads and displays video thumbnails with the play icon.
- [ ] Infinite scrolling is functional and mimics TikTok swipe gestures on mobile devices.
- [ ] The backend API returns dynamic mock data for video entries without real-time updates.
- [ ] The UI is responsive and optimized for mobile performance.

### **Technical Details**
- **Backend**: 
  - Create a new endpoint (`GET /explore/videos`) under the Explore feature in the API project.
  - Implement a query handler that returns a paginated list of video items from an in-memory repository using dynamic mock data.

- **Frontend (Blazor)**: 
  - Create a new Explore feature folder with components: `Explore.razor` (main Blazor page) and `VideoCard.razor` (individual video thumbnail component).
  - Use scoped CSS (e.g., Explore.razor.css) following BEM conventions for styling.
  - Implement infinite scrolling with swipe gesture handling for mobile using basic touch event handling available in Blazor.
  - Optionally, integrate state management using Blazor's built-in capabilities.
  - Write unit tests targeting ~80% coverage.

### **Mockups/Designs**
- Placeholder images with a centered play icon overlay. (Design reference: TikTok video thumbnails.)

### **Additional Context**
- Mobile-first design is critical; desktop enhancements can follow later.
- Minimal third-party dependencies; all new code should conform to existing project architecture.

### **Definition of Done (DoD)**
- Code passes all unit tests and lint checks.
- Feature works on mobile devices with infinite scrolling and swipe gestures.
- Documentation is updated to reflect the new feature.
```

---

## 3. Combined TDD & Execution Checklist

### **Front-End (Blazor)**
- [ ] **Red**: Create a failing unit test in `src/WebsitePeak.Prospector.Web.Tests/ExplorePageTests.cs` that expects the Explore page to render a list of VideoCard components with a play icon overlay.
- [ ] **Green**: Implement the `Explore.razor` component in `src/WebsitePeak.Prospector.Web/Pages/Explore.razor` to render a static list of VideoCard components.
- [ ] **Green**: Create the `VideoCard.razor` component in `src/WebsitePeak.Prospector.Web/Components/VideoCard.razor` to display a static video thumbnail and play icon overlay.
- [ ] **Green**: Add a scoped CSS file `Explore.razor.css` (or similar) in the same folder as `Explore.razor` to style the page using BEM naming conventions.
- [ ] **Green**: Incorporate infinite scrolling and swipe gesture support on the Explore page using Blazor's event handling (touch events).
- [ ] **Refactor**: Optimize the Explore and VideoCard components for clarity and performance. Integrate state management if necessary.

### **Backend (ASP.NET Core)**
- [ ] **Red**: Write a failing unit test in `ExploreUnitTests/ExploreVideosQueryTests.cs` expecting the `/explore/videos` endpoint to return a paginated list of video items.
- [ ] **Green**: Create a new `ExploreController.cs` in `src/WebsitePeak.Prospector.Api/Explore/` with a `GET /explore/videos` endpoint.
- [ ] **Green**: Implement the `ExploreVideosQuery.cs` and its handler under `src/WebsitePeak.Prospector.Api/Explore/Queries/` to serve dynamic mock video data from an in-memory repository.
- [ ] **Refactor**: Refine the controller and query logic to ensure proper separation of concerns and optimize performance. Update tests to cover edge cases (e.g., pagination boundaries).

### **Additional Tasks**
- [ ] Update the .http file with an endpoint test for `GET /explore/videos`.
- [ ] Ensure all code follows the established coding guidelines for C#, Blazor (Razor components), and CSS (BEM conventions).
- [ ] Confirm that all tests pass and there are no linting issues.
- [ ] Ask for permission if any deviations from this checklist are necessary.

---

This combined checklist covers both our TDD steps (Red, Green, Refactor) and the execution tasks required to implement the feature using Blazor on the front-end and ASP.NET Core on the back-end. Please review and let me know if any further adjustments are needed. 