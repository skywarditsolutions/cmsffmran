# RAN Prototype - Customer Testing Guide

**Application URL:** https://dm3z85jabb0r5.cloudfront.net
**Source Code:** https://github.com/skywarditsolutions/cmsffmran

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Agent - Bob Amos (MI, French) | bob.amos@ran.demo | Agent#Demo123 |
| Agent - Kevin McTigue (MI, German) | kevin.mctigue@ran.demo | Agent#Demo123 |
| Administrator | admin@ran.demo | Admin#Demo123 |

---

## Demo Routing Table

| ZIP Code | State | Language | Routes To |
|----------|-------|----------|-----------|
| 48201 | MI | French | Bob Amos (only MI agent with French) |
| 48201 | MI | German | Kevin McTigue (only MI agent with German) |
| 48201 | MI | English | Either Bob or Kevin (load-balanced) |

Bob Amos and Kevin McTigue are the only agents licensed in Michigan. This makes it easy to control exactly which agent receives a request during testing.

---

## Test 1: Consumer Intake & Real-Time Routing (5 min)

**What this demonstrates:** Consumer intake form, HealthCare.gov-style UI, TCPA consent, real-time WebSocket push to agent, PII protection.

### Steps

1. Open two browser windows side by side:
   - **Window A:** Go to https://dm3z85jabb0r5.cloudfront.net/assist
   - **Window B:** Go to https://dm3z85jabb0r5.cloudfront.net/login?role=agent and sign in as `bob.amos@ran.demo` / `Agent#Demo123`

2. In Window A, fill out the consumer form:
   - First name: **Demo**
   - Last name: **Test**
   - Phone: **5551234567**
   - Phone type: **Mobile**
   - ZIP code: **48201**
   - Preferred language: **French**
   - Check the TCPA consent box
   - Click **Request a callback**

3. Observe Window A: The consumer sees a confirmation page with a Reference ID and "Finding an available agent or broker near you..."

4. Within a few seconds, observe Window B: A referral card appears on Bob's dashboard with a 30-second countdown timer. The card shows "French speaker in Detroit, MI (ZIP 48201)" but consumer name and phone are hidden (PII protection).

5. In Window B, click **Accept**. The consumer's name, phone number, email, and contact preferences are now revealed. The consumer's status page (Window A) updates in real-time to show "An agent has accepted and will call you shortly."

---

## Test 2: Referral Lifecycle (3 min)

**What this demonstrates:** Full referral status lifecycle from Accept through Completed, with real-time consumer status updates.

### Steps

1. Continue from Test 1 (Bob has accepted the referral).

2. In the "Currently serving" section, click **Start working**. The status badge changes to "In progress." The consumer's page (Window A) updates to "Your agent is assisting you."

3. Click **Mark completed**. The case card briefly shows "Completed" status, then auto-dismisses after 2 seconds. The consumer's page updates to "Your enrollment assistance is complete."

4. The referral now appears in Bob's **Referral history** table at the bottom of the page.

---

## Test 3: One Active Referral Limit (2 min)

**What this demonstrates:** An agent can only have one active referral at a time, preventing workload overload.

### Steps

1. Submit a new consumer request (ZIP 48201, French) from Window A as in Test 1.

2. Accept the referral on Bob's dashboard.

3. Submit another consumer request (ZIP 48201, French) from Window A.

4. Observe: The second referral appears on Bob's dashboard, but the Accept button is replaced with a message: "Complete your current active referral before accepting another."

5. Complete or close the first referral (Start working > Mark completed, or Not a good referral). The second referral's Accept button becomes available.

---

## Test 4: Routing Timeout & Safety-Net Broadcast (4 min)

**What this demonstrates:** Multi-attempt routing with timeout, safety-net broadcast when no agent responds.

### Steps

1. Submit a consumer request (ZIP 48201, French) from Window A.

2. On Bob's dashboard, do NOT click Accept. Let the 30-second countdown expire.

3. Observe: The referral disappears from Bob's incoming panel. The consumer's page updates to "No agents are on duty right now. We've notified licensed agents in your state."

4. The system enters SafetyNet mode and broadcasts the referral to all licensed MI agents. If Bob is the only MI agent with French, the request goes to safety-net and will be visible as a safety-net referral on Bob's dashboard (no countdown, no penalty).

---

## Test 5: Admin Dashboard - Operations Control Plane (5 min)

**What this demonstrates:** Live metrics, request timeline, agent management, compliance flags, business rule configuration.

### Steps

1. Open a third browser window and go to https://dm3z85jabb0r5.cloudfront.net/login?role=admin
2. Sign in as `admin@ran.demo` / `Admin#Demo123`

3. **Metrics panel:** Review the top metrics bar showing active requests, total requests, agents online, average response time, acceptance rate, re-routes, and safety-net count. These update in real-time.

4. **Requests panel:** Expand the "Requests" section. Each request shows a numbered card with consumer state (masked PII), status, timestamp, and routing history. Click a card to expand the full routing timeline showing each attempt (notified, timed out, re-routed, safety-net broadcast).

5. **Business rules:** Locate the "Business rules" card. Observe the configurable values:
   - Referral timeout: 30 seconds (demo) / 900 seconds (production)
   - Max routing attempts: 5
   - Proximity weight: 0.3
   - Try changing a value and click **Save configuration** to see real-time config updates without redeployment.

6. **Agents & brokers:** Expand the "Agents & brokers" section. Use the search box to filter by name, NPN, state, or language. Click any agent row to view their full profile (licensure, availability, load, training status).

7. **Compliance flags:** Expand the "Compliance flags" section to see agents with missed referrals, deactivation risk, stale passwords, or lapsed training.

---

## Test 6: Admin Agent Detail & Push Notifications (3 min)

**What this demonstrates:** Per-agent drill-down, custom notification delivery.

### Steps

1. In the admin dashboard, search for "Bob" in the Agents & brokers panel.

2. Click Bob Amos's row to open the agent detail page.

3. Review the profile: NPN, licensed states, languages, availability schedule, performance stats, training status.

4. Scroll to the "Send notification" section.

5. Select channel **Push (real-time)**, type a message like "Test notification from admin", and click **Send**.

6. Switch to Bob's browser window (Window B). The notification appears in the "Messages from admin" card in the left sidebar.

7. Bob can dismiss the message by clicking the X button.

---

## Test 7: Agent Dashboard Features (4 min)

**What this demonstrates:** Agent self-service capabilities including profile, schedule, OOO, notifications.

### Steps

1. On Bob's agent dashboard, review the left sidebar:
   - **Profile card:** Avatar, name, NPN, licensed states, online/offline toggle, languages
   - **Performance stats:** Accepted today, average response time, total accepted, missed count
   - **Training card:** Last verified date, due next, status, link to training portal

2. **Online/Offline toggle:** Click the toggle to go offline. A confirmation dialog appears. Click Cancel to stay online.

3. **Weekly schedule editor:** In the Availability section, observe the 7-day schedule with time ranges. Try toggling a day off and back on. The Save button enables when changes are detected.

4. **Out of Office:** Use the calendar to click a start date, then click an end date. Click Save to set OOO. Click Clear to remove it.

5. **Notification preferences:** Toggle SMS, Email, or Push notifications on/off and click Save preferences.

6. **Referral history:** Expand the Referral history section. Try the filter dropdown (All, Accepted, Missed, Rejected, Safety net) and click column headers to sort.

---

## Test 8: German Language Routing to Kevin (2 min)

**What this demonstrates:** Language-based routing to a different agent.

### Steps

1. Sign in as `kevin.mctigue@ran.demo` / `Agent#Demo123` in a new browser window.

2. Submit a consumer request from Window A with:
   - ZIP: **48201**
   - Language: **German**

3. Observe: The referral appears on Kevin's dashboard (not Bob's), since Kevin is the only MI agent who speaks German.

4. Kevin can accept and process the referral following the same lifecycle as Test 2.

---

## Notes

- **30-second timeout:** The demo uses a 30-second routing timeout (production would be 15 minutes / 900 seconds). If you need more time to narrate during a demo, an admin can change the timeout in the Business Rules card on the admin dashboard.
- **One active referral:** Agents are limited to one active referral at a time. Complete or close the current referral before accepting another.
- **Real-time updates:** All status changes (accept, start working, complete) push in real-time to both the consumer and admin dashboards via WebSocket.
- **PII protection:** Consumer names and phone numbers are encrypted with KMS and only revealed to the accepting agent. The admin dashboard shows masked PII (initials only).
- **Session expiry:** Cognito tokens expire after 1 hour. If you see "session expired," simply sign in again. The system automatically attempts token refresh before redirecting.
- **CloudFront cache:** If changes look stale, hard-refresh with Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows).
