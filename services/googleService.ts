
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export interface GmailMessage {
  id: string;
  snippet: string;
  subject?: string;
  from?: string;
  date?: string;
}

class GoogleService {
  private async fetchWithToken(url: string, token: string) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Token might be expired');
      }
      throw new Error(`Google API Error: ${response.statusText}`);
    }
    return response.json();
  }

  async getCalendarEvents(token: string): Promise<GoogleCalendarEvent[]> {
    const now = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=10&orderBy=startTime&singleEvents=true`;
    const data = await this.fetchWithToken(url, token);
    return data.items || [];
  }

  async createCalendarEvent(token: string, event: { summary: string, description: string, start: string, end: string }) {
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const body = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end }
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create calendar event: ${response.statusText}`);
    }
    return response.json();
  }

  async getGmailMessages(token: string): Promise<GmailMessage[]> {
    const url = 'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=subject:stěhování';
    const data = await this.fetchWithToken(url, token);
    const messages = data.messages || [];
    
    // Fetch details for each message
    const detailedMessages = await Promise.all(
      messages.map(async (msg: { id: string }) => {
        const detailUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
        const detail = await this.fetchWithToken(detailUrl, token);
        
        const headers = detail.payload.headers;
        const subject = headers.find((h: any) => h.name === 'Subject')?.value;
        const from = headers.find((h: any) => h.name === 'From')?.value;
        const date = headers.find((h: any) => h.name === 'Date')?.value;

        return {
          id: msg.id,
          snippet: detail.snippet,
          subject,
          from,
          date
        };
      })
    );
    
    return detailedMessages;
  }
}

export const googleService = new GoogleService();
