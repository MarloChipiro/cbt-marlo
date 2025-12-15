import 'package:flutter/material.dart';

// This is the main entry point of the Flutter application.
void main() {
  // Run the App widget
  runApp(const ConsumerTrackerApp());
}

// The root widget of your application.
class ConsumerTrackerApp extends StatelessWidget {
  const ConsumerTrackerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Consumer Behavior Tracker',
      theme: ThemeData(
        // We will use a consistent primary color.
        primarySwatch: Colors.indigo, 
        useMaterial3: true,
      ),
      // This is the starting screen of the app.
      home: const PlaceholderScreen(),
    );
  }
}

// A simple placeholder screen to confirm the app launches successfully.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Consumer Tracker App'),
        backgroundColor: Theme.of(context).primaryColor,
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 80, color: Colors.green),
            SizedBox(height: 20),
            Text(
              'App Loaded Successfully!',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 10),
            Text(
              'Ready to implement Login/Dashboard.',
              style: TextStyle(fontSize: 16, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
