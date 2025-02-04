namespace GauntletExchange.Clients
{
    public partial class MainPage : ContentPage
    {
        public MainPage()
        {
            InitializeComponent();
            
            webView.Source = new UrlWebViewSource 
            { 
                Url = "https://exchange.gauntletai.io/explore" 
            };
        }
    }
}
